# Strict JSON parser follow-up

The earlier M04F replay profile identified token-by-token JSON parsing as a major allocation source. `contracts.ParseJSON` now performs a bounded structural pass for normalized duplicate keys and the original depth limit, then decodes values once with `encoding/json.Unmarshal`. Input byte, UTF-8 and surrogate checks remain before both passes. Structural/depth/duplicate rejection precedes allocation of the full document. Literal/string syntax and binary64 values retain the standard library decoder. Public schemas, generated bindings and original fixtures were not edited.

The old token-parser implementation is frozen in `server/internal/contracts/parser_test.go` as a differential oracle. Verification compares both acceptance and parsed values, including exact floating-point bits. It covers escaped equivalent keys, nested duplicates, boundary depths (including empty containers), malformed syntax, Unicode/surrogates, trailing input, number overflow/underflow and large integers. The saved public fixture corpus and 3,000 deterministic mutation attempts passed. A separate bounded fuzz run passed 66,394 executions from 57 seeds without a mismatch.

Native Windows, pinned Go 1.26.8, Ryzen 9 5900HX. The same three saved public JSON inputs were measured before and after with 100 ms per benchmark and three samples. Times below are sample medians. These measurements isolate parsing; they do not include schema validation, SQL, policy or full requests.

| Saved input | Before median | After median | Allocations before → after | Bytes before → after |
|---|---:|---:|---:|---:|
| Command | 4.258 µs | 1.587 µs | 60 → 23 | 2,280 → 800 |
| Platform session view | 133.414 µs | 63.008 µs | 2,132 → 775 | 56,816 → 28,408 |
| Platform account view | 65.540 µs | 31.140 µs | 1,105 → 416 | 30,368 → 13,880 |

Full contract tests passed in 0.301 seconds, frozen cross-runtime compatibility tests in 35.876 seconds, and session tests in 0.793 seconds. The differential fuzz package reported 11.509 seconds; its whole process tree completed in 26.292 seconds under a 60-second watchdog. All test binaries had a 30-minute limit and every run completed well within it. Scoped `git diff --check` passed. No database or full repository suite ran for this parser change.

Exact commands, raw output and source/input/output hashes are retained in [before](parser-before.json) and [after](parser-after.json) and their linked text files. No error or parsed-document cache was introduced. Whole-request improvement remains a separate measurement.
