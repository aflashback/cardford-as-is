# Access specification moved

The current product and subscription specification is [06 — Commercialization](06-commercialization.md). It supersedes the earlier permanent free-game offer and decision-based coaching allowance.

Latest owner direction: unpaid visitors get only the fixed authored demo; full play requires membership. Prices and family limits are proposals. See [07 — Hosted architecture](07-hosted-architecture.md), [08 — Test gates](08-commercial-testing.md) and [09 — Delivery and evidence](09-delivery-and-evidence.md). No payment or service implementation is claimed.

## Follow the current access design

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Segoe UI, Arial, sans-serif","fontSize":"14px","lineColor":"#64748B","textColor":"#183153","primaryTextColor":"#183153","edgeLabelBackground":"#FFFFFF","clusterBkg":"#F8FAFC","clusterBorder":"#CBD5E1"},"flowchart":{"curve":"basis","htmlLabels":false,"nodeSpacing":24,"rankSpacing":36}}}%%
flowchart TD
  accTitle: Current access specification
  accDescr: The moved access page leads to the current commercial policy, enforced by hosted architecture and tested by the acceptance suite.
  A("This moved access page"):::muted --> B("06 · Commercialization"):::view
  B --> C{"Demo or paid live access"}:::gate
  C --> D("07 · Server enforcement"):::service
  D --> E{"08 · Acceptance checks"}:::gate
  E --> F("09 · Delivery sequence"):::view
  classDef view fill:#E8F1FC,stroke:#7FA6CB,color:#14283F;
  classDef service fill:#E5F5EF,stroke:#65A68C,color:#173F33;
  classDef gate fill:#FFF3D9,stroke:#C7A253,color:#594219;
  classDef muted fill:#F1F5F9,stroke:#94A3B8,color:#334155,stroke-dasharray:4 3;
```
