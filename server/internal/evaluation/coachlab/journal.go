package coachlab

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const maxJournalBytes = 512 << 20

type JournalEntry struct {
	Sequence int             `json:"sequence"`
	Kind     string          `json:"kind"`
	Previous string          `json:"previous"`
	Payload  json.RawMessage `json:"payload"`
	Hash     string          `json:"hash"`
}
type Journal struct {
	dir              string
	file             *os.File
	lock             *os.File
	entries          []JournalEntry
	bytes            int64
	closed, poisoned bool
}
type journalHeader struct {
	SchemaVersion string      `json:"schemaVersion"`
	ManifestHash  string      `json:"manifestHash"`
	Envelope      RunEnvelope `json:"envelope"`
}

func entryHash(e JournalEntry) string { e.Hash = ""; raw, _ := json.Marshal(e); return Digest(raw) }
func OpenJournal(out string, e RunEnvelope, resume bool) (*Journal, error) {
	if err := e.Validate(); err != nil {
		return nil, err
	}
	dir, err := filepath.Abs(out)
	if err != nil {
		return nil, err
	}
	if !resume {
		if err = os.Mkdir(dir, 0700); err != nil {
			return nil, fmt.Errorf("new run requires nonexistent output directory: %w", err)
		}
		if err = os.Mkdir(filepath.Join(dir, "private"), 0700); err != nil {
			return nil, err
		}
	}
	lock, err := os.OpenFile(filepath.Join(dir, "private", "owner.lock"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return nil, fmt.Errorf("exclusive run lock unavailable; stop/check recorded owner before explicit stale-lock recovery: %w", err)
	}
	j := &Journal{dir: dir, lock: lock}
	cleanup := func(err error) (*Journal, error) { _ = j.Close(); return nil, err }
	if _, err = fmt.Fprintf(lock, "pid=%d\n", os.Getpid()); err != nil {
		return cleanup(err)
	}
	if err = lock.Sync(); err != nil {
		return cleanup(err)
	}
	name := filepath.Join(dir, "private", "journal.jsonl")
	if resume {
		f, err := os.Open(name)
		if err != nil {
			return cleanup(err)
		}
		scanner := bufio.NewScanner(io.LimitReader(f, maxJournalBytes+1))
		scanner.Buffer(make([]byte, 65536), 16<<20)
		previous := ""
		for scanner.Scan() {
			line := append([]byte{}, scanner.Bytes()...)
			j.bytes += int64(len(line) + 1)
			if j.bytes > maxJournalBytes {
				_ = f.Close()
				return cleanup(fmt.Errorf("journal exceeds bound"))
			}
			var entry JournalEntry
			if err = strict(line, &entry); err != nil {
				_ = f.Close()
				return cleanup(fmt.Errorf("invalid/torn journal record: %w", err))
			}
			if entry.Sequence != len(j.entries) || entry.Previous != previous || entry.Hash != entryHash(entry) {
				_ = f.Close()
				return cleanup(fmt.Errorf("journal chain mismatch at %d", len(j.entries)))
			}
			previous = entry.Hash
			j.entries = append(j.entries, entry)
		}
		err = scanner.Err()
		_ = f.Close()
		if err != nil {
			return cleanup(err)
		}
		if len(j.entries) == 0 || j.entries[0].Kind != "run-start" {
			return cleanup(fmt.Errorf("missing run header"))
		}
		var header journalHeader
		if err = strict(j.entries[0].Payload, &header); err != nil {
			return cleanup(err)
		}
		current, _ := json.Marshal(e)
		frozen, _ := json.Marshal(header.Envelope)
		if header.SchemaVersion != "coach-lab-journal-1.0.0" || header.ManifestHash != e.ManifestHash() || !bytes.Equal(current, frozen) {
			return cleanup(fmt.Errorf("resume manifest/source/binary identity differs"))
		}
		// A valid JSON tail without newline might be a torn append. Refuse rather
		// than concatenate or silently discard it; recovery requires inspection.
		tail, err := os.Open(name)
		if err != nil {
			return cleanup(err)
		}
		info, _ := tail.Stat()
		if info.Size() > 0 {
			last := make([]byte, 1)
			_, err = tail.ReadAt(last, info.Size()-1)
			if err == nil && last[0] != '\n' {
				err = fmt.Errorf("unterminated journal tail; explicit recovery required")
			}
		}
		_ = tail.Close()
		if err != nil {
			return cleanup(err)
		}
	}
	flags := os.O_WRONLY | os.O_APPEND
	if !resume {
		flags |= os.O_CREATE | os.O_EXCL
	}
	j.file, err = os.OpenFile(name, flags, 0600)
	if err != nil {
		return cleanup(err)
	}
	if !resume {
		if err = j.Append("run-start", journalHeader{"coach-lab-journal-1.0.0", e.ManifestHash(), e}); err != nil {
			return cleanup(err)
		}
	}
	return j, nil
}
func (j *Journal) Append(kind string, value any) error {
	if j == nil || j.closed || j.poisoned || j.file == nil {
		return fmt.Errorf("journal unavailable")
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	prev := ""
	if len(j.entries) > 0 {
		prev = j.entries[len(j.entries)-1].Hash
	}
	entry := JournalEntry{Sequence: len(j.entries), Kind: kind, Previous: prev, Payload: payload}
	entry.Hash = entryHash(entry)
	line, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	line = append(line, '\n')
	if len(line) > 16<<20 || j.bytes+int64(len(line)) > maxJournalBytes {
		return fmt.Errorf("journal archive budget exhausted")
	}
	n, err := j.file.Write(line)
	if err == nil && n != len(line) {
		err = io.ErrShortWrite
	}
	if err == nil {
		err = j.file.Sync()
	}
	if err != nil {
		j.poisoned = true
		return err
	}
	j.bytes += int64(n)
	j.entries = append(j.entries, entry)
	return nil
}
func (j *Journal) Entries() []JournalEntry {
	out := make([]JournalEntry, len(j.entries))
	for i, e := range j.entries {
		out[i] = e
		out[i].Payload = append(json.RawMessage{}, e.Payload...)
	}
	return out
}
func (j *Journal) Close() error {
	if j == nil || j.closed {
		return nil
	}
	j.closed = true
	var err error
	if j.file != nil {
		err = j.file.Close()
	}
	if j.lock != nil {
		if e := j.lock.Close(); err == nil {
			err = e
		}
		if e := os.Remove(filepath.Join(j.dir, "private", "owner.lock")); err == nil {
			err = e
		}
	}
	return err
}

// ExportSnapshot writes a deterministic derived view once, or verifies that
// identical bytes already exist. Private journal records remain authoritative.
func (j *Journal) ExportSnapshot(relative string, data []byte) error {
	target := filepath.Join(j.dir, relative)
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return err
	}
	existing, err := os.ReadFile(target)
	if err == nil {
		if bytes.Equal(existing, data) {
			return nil
		}
		return fmt.Errorf("immutable export already exists with different bytes")
	}
	if !os.IsNotExist(err) {
		return err
	}
	f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	if e := f.Close(); err == nil {
		err = e
	}
	return err
}
func (j *Journal) PublishExportPointer(snapshot, decisionsDigest, receiptDigest string) error {
	if !validHash(decisionsDigest) || !validHash(receiptDigest) {
		return fmt.Errorf("exact corpus byte digests required")
	}
	raw, err := json.Marshal(map[string]string{"schemaVersion": "coach-lab-export-pointer-1.0.0", "snapshot": snapshot, "decisionsDigest": decisionsDigest, "receiptDigest": receiptDigest})
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(j.dir, ".export-pointer-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err = f.Write(append(raw, '\n')); err == nil {
		err = f.Sync()
	}
	if e := f.Close(); err == nil {
		err = e
	}
	if err != nil {
		return err
	}
	return os.Rename(name, filepath.Join(j.dir, "latest-export.json"))
}
