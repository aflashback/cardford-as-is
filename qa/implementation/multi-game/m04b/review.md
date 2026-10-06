# M04B review

## Review scope

Review the original default policy/coach port, the game-owned V2 session adapters, and the generic registry/session boundary. Compare against preserved TypeScript sources and immutable original cue/policy goldens. This review does not approve an HTTP listener, store activation, new strategy or a frontend cutover.

## Findings addressed during implementation

1. **Trusted preparation must not serialize and reparse its own observation.** The initial game adapters marshaled the complete actor observation and passed it through the untrusted JSON decoder before every analysis. Both independent review and integration review identified the unnecessary work. The final adapters construct the compatibility observation directly from allowlisted typed fields, with detached arrays, and validate it in the original policy. JSON remains at import, digest, output and persistence boundaries.
2. **A trusted transition needs one owned next snapshot.** The initial generic wrapper cloned a game-owned reducer result again. The final wrapper retains the reducer's owned immutable result without a second whole-history copy, while cloning external initial state and detached public outputs. The Spades event projector also captures only its variant string, avoiding retention of the initial private aggregate through its closure.
3. **Numeric spellings are semantic JSON values.** V2 imports now accept integer-valued decimal/exponent spellings accepted by the preserved TypeScript reader, and still reject duplicate keys, malformed Unicode, nulls and unexpected fields. The fix stays within the new V2 boundaries. Spades V2 schema lengths count Unicode code points; V1 retains UTF-16 lengths. A narrow validation callback preserves both interpretations without duplicating the rules validator. The independent edge corpus first reproduced ten mismatches and now checks their correction.
4. **Unsupported saved policies cannot use the legacy fallback.** The original TypeScript coach can render some unknown historical V1 policies through its legacy fallback. New Go execution intentionally supports only the two exact installed defaults. `PolicySupport` must report unsupported pins explicitly; `Explain` cannot substitute a default. Existing original advice remains stored/read as original bytes, without rerendering.

## Compatibility details and limits

The original V2 Hearts state reader has different import semantics from the V1 archive reader: it permits unsorted holdings and some event archives that V1's full chronology validation rejects. The separate V2 validator preserves the M02 reader's behavior; it does not weaken the V1 codec. An independent TypeScript boundary corpus records both accepted and rejected cases. M04C must still bind persisted state, journal and prepared decisions to replay anchors and atomic commits; accepting a module document is not proof of durable command provenance.

The M02 V2 document wrapper preserves journal/audit JSON values and array order. Its original TypeScript parser rebuilds these objects; raw object-member order is not part of that contract. A new test initially required stronger byte-order equality and was corrected after checking that parser. M03's separately stored original analysis/advice bytes remain unchanged and retain their stricter byte-preservation requirement.

`BoundSession.Prepare` preserves the original M02 registered-analysis projection and input digest. Full original policy analysis and coach advice are also available through the game reasoning/coaching packages and verified independently. M04C must compose the frozen full analysis/advice and registered result into one prepared-work publication with exact policy/component/budget pins. It must not rerun a newer policy when reading original advice. M03's storage registrations alone still do not supply an execution algorithm.

The compatibility package retains the old mixed-game facts vocabulary solely for the frozen policies. New generic session orchestration does not reason about bids, trump or partners. Future game reasoning must supply its own facets rather than copy the legacy compatibility vocabulary.

The original all-event observation and immutable game-state history still grow with a match. Removing redundant conversions/copies does not make them constant-size, nor does this acceptance measure service capacity. No new Go-versus-Node performance comparison was run. The native database cancellation/cleanup follow-up from M04A remains part of the next service activation work.
