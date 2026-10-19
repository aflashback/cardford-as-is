package coachlab

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// MandatorySourceFiles freezes all native implementation sources (including
// collector and generated DTOs), toolchain/module pins and contract sources.
// It deliberately includes the current dirty checkout, never just Git HEAD.
func MandatorySourceFiles(root string) ([]string, error) {
	files := []string{"go.mod", "go.sum", "scripts/windows-tools.json"}
	for _, dir := range []string{"server/internal", "server/cmd/coachlab", "contracts/evaluation-lab", "web/shared"} {
		err := filepath.WalkDir(filepath.Join(root, dir), func(p string, entry fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return fmt.Errorf("source graph contains symlink %s", p)
			}
			if entry.IsDir() {
				return nil
			}
			name := entry.Name()
			include := strings.HasSuffix(name, ".go") && !strings.HasSuffix(name, "_test.go") || strings.HasSuffix(name, ".schema.json")
			if include {
				rel, err := filepath.Rel(root, p)
				if err != nil {
					return err
				}
				files = append(files, filepath.ToSlash(rel))
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	sort.Strings(files)
	return files, nil
}
func checkedPath(root, name string) (string, error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	resolvedRoot, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", err
	}
	target, err := filepath.EvalSymlinks(filepath.Join(resolvedRoot, filepath.FromSlash(name)))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(resolvedRoot, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", fmt.Errorf("source path escapes root")
	}
	return target, nil
}
func fileDigest(name string) (string, error) {
	info, err := os.Stat(name)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() || info.Size() > 128<<20 {
		return "", fmt.Errorf("invalid bounded source/binary file")
	}
	data, err := os.ReadFile(name)
	if err != nil {
		return "", err
	}
	return Digest(data), nil
}
func SourceSnapshot(root, binary string) (map[string]string, SourceIdentity, error) {
	hashes := map[string]string{}
	files, err := MandatorySourceFiles(root)
	if err != nil {
		return nil, SourceIdentity{}, err
	}
	for _, name := range files {
		p, err := checkedPath(root, name)
		if err != nil {
			return nil, SourceIdentity{}, err
		}
		h, err := fileDigest(p)
		if err != nil {
			return nil, SourceIdentity{}, err
		}
		hashes[name] = h
	}
	b, err := fileDigest(binary)
	if err != nil {
		return nil, SourceIdentity{}, err
	}
	return hashes, SourceIdentity{SourceDigest(hashes), b}, nil
}
func VerifySources(root, binary string, e RunEnvelope) error {
	if e.Lab.SourceIdentity.SourceDigest != SourceDigest(e.Base.SourceHashes) {
		return fmt.Errorf("source graph digest mismatch")
	}
	for _, p := range []HashPin{e.Base.RuleProfile, e.Base.Candidate, e.Base.Reference} {
		if p.Hash != e.Lab.SourceIdentity.SourceDigest {
			return fmt.Errorf("component pin must bind the frozen transitive source graph")
		}
	}
	files, err := MandatorySourceFiles(root)
	if err != nil {
		return err
	}
	for _, name := range files {
		if _, ok := e.Base.SourceHashes[name]; !ok {
			return fmt.Errorf("mandatory source absent: %s", name)
		}
	}
	for name, want := range e.Base.SourceHashes {
		p, err := checkedPath(root, name)
		if err != nil {
			return err
		}
		got, err := fileDigest(p)
		if err != nil {
			return err
		}
		if got != want {
			return fmt.Errorf("source bytes changed: %s", name)
		}
	}
	h, err := fileDigest(binary)
	if err != nil {
		return err
	}
	if h != e.Lab.SourceIdentity.BinaryDigest {
		return fmt.Errorf("binary bytes differ from frozen envelope")
	}
	return nil
}
