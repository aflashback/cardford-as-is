# Specification validation — actually performed

**Package:** Card Coach specification 0.2.0 · **Date:** 26 September 2026

This report concerns the planning files only. It is not a release test report for an application.

| Check executed locally | Result |
|---|---|
| Parse all JSON files | 27 parsed |
| Draft 2020-12 schema metaschema checks | 14 passed |
| Validate synthetic examples against their schemas | 10 passed, including both competition modes |
| Resolve JSON Schema/OpenAPI references | 58 references resolved locally |
| Parse OpenAPI and check operations, IDs, path parameters and CSRF declarations | 21 unique operations checked |
| Check OpenAPI component schema syntax | Passed |
| Independently recalculate original scoring goldens against document 02 formula | 12 rows reconcile |
| Check two observation fixtures: suit counts, known-card uniqueness, actor, remaining counts and candidate IDs | Passed for these examples only |
| Check synthetic provider candidate keys, probability sum and argmax | Passed |
| Deliberately malformed/unsafe fixtures | 8 rejected by structural or explicit semantic checks |
| Check relative Markdown file links | 18 resolved |

A full OpenAPI conformance validator was not run; the API was parsed and structurally/reference checked as described. JSON schema checks do not prove game correctness or information-set safety across all states. Structural validation is not a substitute for the listed domain checks. The private engine-state/event schemas and test-only module implementation remain W02 deliverables.

## Not performed

No application implementation, dependency installation/lockfile compatibility test, engine/property test run, Jev account authentication or API call, strategy benchmark, browser/device/accessibility run, deployment, expert labelling or learning study. All such work remains in the delivery gates.

Provider responses, confidence, token usage and latency in example files are synthetic contract illustrations, not measurements. Original scoring units are not complete playable deals; the twelve production drills still require full authored fixtures and tests.

The archive contains specification documents, schemas, OpenAPI, configuration templates and illustrative fixtures only. Temporary file-generation/QA scripts used to prepare the pack are not part of the future app.
