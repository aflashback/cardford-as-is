# Saved-policy review continuation — 2026-10-07

Requirements: MG-07 actor information isolation, MG-08 explicit continuation semantics, and the M04E saved-source review journey.

The real Partners browser journey completed a hand and delivered saved advice, then showed “Continuation stopped” when requesting an alternative. `platformTrial` supplied only the saved policy ID to the old game adapter. That adapter accepted only `spades-tactics-2.1.0`, so it rejected the installed `spades-partner-resource-5.0.0` before sampling. The actor-rollout profile would encounter the same rejection in both game adapters.

The service now requires full equality between the original decision's policy tuple and the saved source tuple. The document codec checks the exact installed module/policy and observation mode before dispatching. Partners 5.0 invokes its own analyzer for synthetic replies. Actor-rollout review explicitly uses its pinned `retained-actor-policies-2.0.0` component (the original actor reply policy for that game), rather than rerunning its two-world comparison at every reply. A plain-language note describes this behavior in saved frames. Original-policy frames and notes remain unchanged. Already accepted trials still return immutable saved bytes before new work is admitted; saved original advice is not rewritten.

Only the source actor observation, selected legal alternative, and persisted seed reach the synthetic referee. The illustration stops at the end of the current trick and respects cancellation. Existing access, source security, revision, charge, lease, and completion fences remain in place.

## Focused evidence

- Before the implementation, `TestPartnerResourceIllustrationUsesSavedPolicy` failed with `unsupported source continuation` on the first reachable fixture.
- After the implementation, all four selected pure tests passed; the service package compiled. Native watchdog elapsed time: 5.784 seconds, 60-second invocation ceiling, no database tests selected.
- Coverage: 40 reachable Partners observations remain unmodified and finish at one trick; Solo rejects the Partners policy; all three original and actor-rollout modes remain executable after restart selects original; Partners remains executable after restart; altered original/source and installed component tuples fail; cancelled work fails; original frames and notes match direct old-adapter output; actor replies match the pinned retained component and disclose that the full search is not repeated.

```powershell
node scripts/bounded-native-run.mjs --seconds=60 -- node scripts/windows-env.mjs go -C server test ./internal/games/hearts ./internal/games/spades ./internal/records ./internal/service -run '^(TestPartnerResourceIllustrationUsesSavedPolicy|TestSavedPolicyIllustrationDispatchAndRestart|TestPlatformIllustrationIsolatedBoundedAndPinned|TestPlatformHeartsIllustrationPreservesPassKnowledge)$' -count=1
```

The original browser failure is retained at [the M12 error context](../m12/partner-resources/startup-bounded/error-context.md); its full browser trace stays in ignored `.local/m12-partner-failure.trace.zip`. The coordinating agent owns the final real-browser rerun and broad Go acceptance. This focused report does not claim those checks, strategic improvement, or independent learning evidence.
