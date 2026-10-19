# Rally responsive numerical review

2026-10-14T01:27:59.878Z

Authored helper outputs with source-estimated seat/announcement rectangles and calculated shell budgets; not measured CSS rendering or device acceptance.

- **PASSED** Nine viewport matrix: hand containment, selected lift, tricks and both Jacks histories
- **PASSED** Notched phone and layout thresholds preserve positive budgets
- **PASSED** Large play activity grows instead of retaining a tiny fixed public pile
- **PASSED** Fit is stateless across large, short, impossible and recovered public histories

| Viewport | Requested pin | Actual pin | Iframe | Hand width | Trick width | Opening Jacks | Full Jacks |
|---|---|---|---|---:|---:|---:|---:|
| 568×320 | false | false | 516.0×320.0 | 54.4 | 42.6 | 36.2 | 23.9 |
| 568×320 | true | false | 516.0×320.0 | 54.4 | 42.6 | 36.2 | 23.9 |
| 667×375 | false | false | 615.0×375.0 | 63.7 | 52.1 | 45 | 32.1 |
| 667×375 | true | false | 615.0×375.0 | 63.7 | 52.1 | 45 | 32.1 |
| 844×390 | false | false | 792.0×390.0 | 66.3 | 54.6 | 46.8 | 33.7 |
| 844×390 | true | true | 572.0×390.0 | 66.3 | 54.6 | 46.8 | 31.7 |
| 915×412 | false | false | 863.0×412.0 | 70 | 58.5 | 49.4 | 36.1 |
| 915×412 | true | true | 643.0×412.0 | 70 | 58.5 | 49.4 | 35.3 |
| 1024×768 | false | false | 1024.0×712.0 | 121 | 75 | 81.2 | 68.8 |
| 1024×768 | true | true | 760.0×712.0 | 104.6 | 82 | 85.4 | 54 |
| 1180×820 | false | false | 1180.0×764.0 | 129.8 | 84 | 91 | 77 |
| 1180×820 | true | true | 896.4×764.0 | 129.2 | 84.2 | 91.2 | 67 |
| 1366×1024 | false | false | 1366.0×968.0 | 154 | 123.9 | 96 | 96 |
| 1366×1024 | true | true | 1041.5×968.0 | 154 | 123.9 | 96 | 80.9 |
| 1440×900 | false | false | 1440.0×844.0 | 143.4 | 97.9 | 96 | 89.7 |
| 1440×900 | true | true | 1099.2×844.0 | 143.4 | 97.9 | 96 | 86.5 |
| 1920×1080 | false | false | 1920.0×1024.0 | 154 | 136 | 96 | 96 |
| 1920×1080 | true | true | 1576.0×1024.0 | 154 | 136 | 96 | 96 |

Seat dimensions and CSS shell budgets are source-derived estimates, not actual DOM rectangles. Selected-card projection uses the canonical transform origin and angle. Glyph readability, clipping in a browser, safe-area behavior on a physical device, drag/throw animation, Coach overlap and prompt fit still need rendered QA. Pin/session/replay behavior is tested separately by approved/verify-coaching-panel.mjs. No renderer, backend or production-game tests were run.
