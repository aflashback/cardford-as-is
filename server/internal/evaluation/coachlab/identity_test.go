package coachlab

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestVerifiedSourceAndBinaryRequired(t *testing.T) {
	root, err := filepath.Abs("../../../..")
	if err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(t.TempDir(), "collector.exe")
	if err = os.WriteFile(binary, []byte("binary-fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	hashes, identity, err := SourceSnapshot(root, binary)
	if err != nil {
		t.Fatal(err)
	}
	e := testEnvelope(t, "spades-partners")
	e.Base.SourceHashes = hashes
	e.Lab.SourceIdentity = identity
	e.Base.RuleProfile.Hash = identity.SourceDigest
	e.Base.Candidate.Hash = identity.SourceDigest
	e.Base.Reference.Hash = identity.SourceDigest
	if err = VerifySources(root, binary, e); err != nil {
		t.Fatal(err)
	}
	bad := e
	bad.Lab.SourceIdentity.SourceDigest = Digest([]byte("changed"))
	if VerifySources(root, binary, bad) == nil {
		t.Fatal("accepted mismatched source digest")
	}
	delete(e.Base.SourceHashes, "go.mod")
	e.Lab.SourceIdentity.SourceDigest = SourceDigest(e.Base.SourceHashes)
	if VerifySources(root, binary, e) == nil {
		t.Fatal("accepted missing mandatory source")
	}
}
func TestExactInputBytesIdentifyResume(t *testing.T) {
	e := testEnvelope(t, "spades-partners")
	raw, _ := json.Marshal(e)
	decoded, err := DecodeRun(append(raw, '\n'))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.ManifestHash() != Digest(append(raw, '\n')) {
		t.Fatal("lost exact manifest bytes")
	}
}
