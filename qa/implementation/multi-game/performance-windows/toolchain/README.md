# Windows Go version control

The [same-source manifest](same-source-control.json) contains all original source/fixture hashes, test binary hashes, exact arguments and six outcomes. Original sources are from commit `064001a61e26338cc9209566fd63957c461c26f9`; the isolated `go.mod` uses `go 1.26.8` for both compilers. This standard-library-only package has no dependency-version difference. Normal runtime settings were used; no preemption/GC workaround was applied.

Published official Windows amd64 archives inspected:

| Release | SHA-256 |
|---|---|
| [Go 1.26.8](https://go.dev/dl/go1.26.8.windows-amd64.zip) | `b92c3b2adae85a11ba71fe7216daf0d84e82af4c8ab6c5625807f28622043a59` |
| [Go 1.27.1](https://go.dev/dl/go1.27.1.windows-amd64.zip) | `a3911b5e0e1b1053f25ed0675f4c1c6aad1e2bfcf253df2b9be4caabd2edd95d` |

The selected development wrapper installs 1.26.8. Keep the 1.27.1 failure as a diagnostic, not a fallback runtime. [Go release policy](https://go.dev/doc/devel/release) supports the previous major line. The similar [upstream Windows report](https://github.com/golang/go/issues/81731) does not establish an identical root cause.

To build another candidate control, extract only `server/internal/games/spades` and `web/server/tests/fixtures/legacy-module-document.json` from that original commit into a **new ignored directory**, add the exact module text from the manifest, and set `GOTOOLCHAIN=local` and a project-local `GOCACHE`. From that control root, run the selected candidate executable with:

```text
go.exe test -c -o <unique-control.exe> ./server/internal/games/spades
```

From the control copy's `server/internal/games/spades` directory, run the compiled executable three times with distinct output/profile files:

```powershell
& <unique-control.exe> '-test.run=^TestFrozenCorpus$' '-test.count=1' '-test.cpuprofile=<unique-profile.pprof>'
```

Quote dotted test flags in PowerShell. A launch/flag error is not a runtime failure. A pass must say `PASS` and exit zero. The retained 1.27.1 runs instead exit 2 with `unexpected return pc for runtime.gopark called from 0x1` and `fatal error: unknown caller pc` during runtime stack scanning; no CPU profile from those failed runs is usable. The three 1.26.8 controls passed. The earlier mixed CPU/allocation diagnostic and original sampled allocation-only audit are labeled separately in [spades-diagnostic.md](spades-diagnostic.md).

A toolchain upgrade also requires ordinary/race native tests, generated contracts, database parity and separate replay/profile verification. These controls do not prove all runtime behavior or an upstream fix.
