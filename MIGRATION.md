# Project provenance

Product: **Tricks Coach**. Legacy workspace name: **jev-test**. Location: **C:/repos/test-jev**. The owner selected **trickscoach.com** on 26 September 2026; the [brand and domain decision](planning/brand-and-domain.md) records the pending manual Vercel setup.

The owner extracted the original v0.2 specification here. Its 56 manifest-listed files were verified against their SHA-256 entries; the original files and manifest remain unchanged.

Four related discussions are preserved under [reference/chats](reference/chats/): the app plan, coaching methods, cost estimate and Jev card-game discussion. Exports preserve available text and original citation markers; those old citation targets were not exposed by the chat reader.

Current analysis starts at [JEV-TEST.md](JEV-TEST.md). New documents record later owner decisions separately from the original implementation baseline.

## Artifact provenance

Provenance map only; current planning specifications and later QA records govern implementation status. Package verification is separate from application testing.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Segoe UI, Arial, sans-serif","fontSize":"14px","lineColor":"#64748B","textColor":"#183153","primaryTextColor":"#183153","edgeLabelBackground":"#FFFFFF","clusterBkg":"#F8FAFC","clusterBorder":"#CBD5E1"},"flowchart":{"curve":"basis","htmlLabels":false,"nodeSpacing":24,"rankSpacing":36}}}%%
flowchart TD
  accTitle: Artifact provenance
  accDescr: The unchanged original pack and preserved discussions inform historical analysis. Current planning and later QA records provide implementation direction and evidence.
  A["Original v0.2 pack"]:::data --> B("56 manifest hashes verified"):::service
  A --> D["Historical analysis"]:::data
  C["Four preserved discussions"]:::data --> D
  D --> E["Current planning files"]:::view
  F("Browser prototype"):::service --> G["Later QA records"]:::data
  classDef data fill:#F1EBFC,stroke:#A68AC9,color:#392B52;
  classDef service fill:#E5F5EF,stroke:#65A68C,color:#173F33;
  classDef view fill:#E8F1FC,stroke:#7FA6CB,color:#14283F;
```

No synced project files or original chats were modified or deleted. All retained artifacts from this work are in this folder. The Codex chat remains bound to the original ChatGPT project mirror; project files are accessed through the destination above.

Package integrity is verified. Application tests, a live Jev trial and a learning study have not been performed.
