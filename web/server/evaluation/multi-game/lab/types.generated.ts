// GENERATED from contracts/evaluation-lab/*.schema.json. Do not edit.
import type {RegisteredActorPacket,CoachMessage} from "../../../../shared/contracts.ts";
export interface LabDecision {
  schemaVersion: "coach-lab-decision-1.0.0";
  decisionId: string;
  familyId: string;
  episodeId: string;
  revision: number;
  actor: number;
  phase: string;
  executionStatus: "prepared" | "committed" | "failed";
  forced: boolean;
  policyPin: {
    seat: number;
    id: string;
    version: string;
  };
  inputDigest: string;
  actorPacket: RegisteredActorPacket;
  /**
   * @minItems 1
   */
  legalCandidates: {
    id: string;
    action: unknown;
  }[];
  selectedCandidateId: string;
  registeredAnalysis: unknown;
  originalAnalysis: unknown;
  originalAdvice: unknown;
  coachMessage?: CoachMessage;
  audit: {
    status: "pending" | "passed" | "failed" | "partially-checkable";
    /**
     * @minItems 0
     */
    checks: {
      id: string;
      status: "passed" | "failed" | "pending" | "partially-checkable";
      detail: string;
    }[];
  };
}

export interface LabEvaluation {
  schemaVersion: "coach-lab-evaluation-1.0.0";
  decisionId: string;
  status: "completed" | "incomplete" | "uncertain" | "unsupported" | "failed";
  objective: string;
  horizon: string;
  /**
   * @minItems 0
   */
  assumptions: string[];
  /**
   * @minItems 0
   */
  testedActions: string[];
  /**
   * @minItems 0
   */
  untestedActions: string[];
  /**
   * @minItems 0
   */
  evidenceRefs: string[];
  /**
   * @minItems 0
   */
  values: {
    actionId: string;
    value: number;
    lower: number;
    upper: number;
    worlds: number;
  }[];
  /**
   * @minItems 0
   */
  limitations: string[];
}

export interface LabGap {
  schemaVersion: "coach-lab-gap-1.0.0";
  id: string;
  decisionId: string;
  layer: "facts" | "belief" | "objective" | "action" | "evaluator" | "explanation" | "coverage";
  status: "hypothesis" | "supported" | "disputed" | "fixed";
  severity: "unknown" | "low" | "medium" | "high";
  /**
   * @minItems 0
   */
  evidenceRefs: string[];
  description: string;
  /**
   * @minItems 0
   */
  candidateRefs: string[];
}

export interface LabGapreview {
  gapId: string;
  caseId: string;
  reviewerId: string | null;
  assessment: "pending" | "supported" | "disputed" | "uncertain";
  rationale: string | null;
  /**
   * @minItems 0
   */
  evidenceRefs: string[];
  exposure: {
    future: boolean;
    otherSeat: boolean;
  };
}

export interface LabHuman {
  schemaVersion: "coach-lab-human-1.0.0";
  caseId: string;
  packetHash: string;
  reviewerId: string | null;
  qualification: string | null;
  reviewedAt: string | null;
  independence: "not-established" | "independent";
  exposure: {
    future: boolean;
    otherSeat: boolean;
    answers: boolean;
  };
  status: "pending" | "acceptable-set" | "unknown" | "contested";
  /**
   * @minItems 0
   */
  acceptableActions: string[];
  rationale: string | null;
}

export interface LabInference {
  schemaVersion: "coach-lab-inference-1.0.0";
  decisionId: string;
  status: "supported" | "insufficient" | "unstable" | "inconsistent";
  assumptionVersion: string;
  work: number;
  /**
   * @minItems 0
   */
  evidenceRefs: string[];
  /**
   * @minItems 0
   */
  estimates: {
    event: string;
    value: number;
    kind: "exact" | "conditional";
  }[];
  /**
   * @minItems 0
   */
  limitations: string[];
}

export interface LabReceipt {
  schemaVersion: "coach-lab-receipt-1.0.0";
  runId: string;
  status: "complete" | "checkpointed" | "censored" | "failed";
  manifestHash: string;
  sourceDigest?: string;
  binaryDigest?: string;
  /**
   * @minItems 0
   */
  episodes: unknown[];
  decisions: number;
  committed: number;
  pending: number;
  forced: number;
  unforced: number;
  providerMode: "fixture";
  strengthClaim: false;
  /**
   * @minItems 0
   */
  errors: string[];
}

export interface LabReview {
  presentationHash?: string;
  schemaVersion: "coach-lab-review-1.0.0";
  id: string;
  caseId: string;
  stage: "A" | "B-cue" | "B-reason" | "C";
  inputHash: string;
  modelPin: string;
  provenance: "llm-proposal" | "fixture";
  status: "pending" | "completed" | "abstained" | "disputed" | "failed";
  verdict: ("supported" | "inferior" | "uncertain" | "not-applicable") | null;
  /**
   * @minItems 0
   */
  acceptableActions: string[];
  /**
   * @minItems 0
   */
  reasons: {
    text: string;
    /**
     * @minItems 0
     */
    evidenceRefs: string[];
  }[];
  /**
   * @minItems 0
   */
  dimensions: {
    name: "strategic-purpose" | "context-grounding" | "action-fidelity" | "uncertainty-honesty" | "reason-completeness";
    assessment: "pass" | "fail" | "uncertain" | "not-applicable";
    /**
     * @minItems 0
     */
    evidenceRefs: string[];
  }[];
}

export type LabRun = {
  [k: string]: unknown;
} & {
  schemaVersion: "coach-lab-run-1.0.0" | "coach-lab-run-2.0.0";
  runId: string;
  base:
    | {
        schemaVersion: "multi-game-evaluation-1.0.0";
        id: string;
        purpose: "development" | "confirmation";
        variant: "hearts-solo" | "spades-solo" | "spades-partners";
        ruleProfile: {
          id: string;
          hash: string;
        };
        candidate: {
          id: string;
          hash: string;
        };
        reference: {
          id: string;
          hash: string;
        };
        sourceHashes: {
          [k: string]: string;
        };
        objective: string;
        horizon: "complete-hand" | "complete-match";
        corpus: {
          version: string;
          hash: string;
          /**
           * @minItems 1
           */
          labelIds: string[];
        } | null;
        /**
         * @minItems 1
         */
        families: {
          id: string;
          split: "discovery" | "confirmation";
          seed: string;
          sealed: boolean;
        }[];
        /**
         * @minItems 1
         */
        rotations: number[];
        seatAssignments: {
          /**
           * @minItems 1
           */
          candidate: number[];
          /**
           * @minItems 1
           */
          reference: number[];
        };
        /**
         * @minItems 1
         */
        environments: string[];
        primaryEstimand: string;
        usefulGain: number | null;
        maximumHarm: number | null;
        powerRationale: string | null;
        multiplicityAdjustment: string | null;
        sampleSize: number | null;
        stoppingRule: string;
        missingRunHandling: string;
        maxWallMs: number;
        maxDecisionMs: number;
        maxDecisions: number;
        promotionAuthority: string | null;
      }
    | {
        schemaVersion: "multi-game-evaluation-2.0.0";
        id: string;
        purpose: "development" | "confirmation";
        variant: "trix-basic-solo" | "trix-basic-partners" | "trix-complex-solo" | "trix-complex-partners";
        ruleProfile: {
          id: string;
          hash: string;
        };
        candidate: {
          id: string;
          hash: string;
        };
        reference: {
          id: string;
          hash: string;
        };
        sourceHashes: {
          [k: string]: string;
        };
        objective: string;
        horizon: "complete-hand" | "complete-match";
        corpus: {
          version: string;
          hash: string;
          /**
           * @minItems 1
           */
          labelIds: string[];
        } | null;
        /**
         * @minItems 1
         */
        families: {
          id: string;
          split: "discovery" | "confirmation";
          seed: string;
          sealed: boolean;
        }[];
        /**
         * @minItems 1
         */
        rotations: number[];
        seatAssignments: {
          /**
           * @minItems 1
           */
          candidate: number[];
          /**
           * @minItems 1
           */
          reference: number[];
        };
        /**
         * @minItems 1
         */
        environments: string[];
        primaryEstimand: string;
        usefulGain: number | null;
        maximumHarm: number | null;
        powerRationale: string | null;
        multiplicityAdjustment: string | null;
        sampleSize: number | null;
        stoppingRule: string;
        missingRunHandling: string;
        maxWallMs: number;
        maxDecisionMs: number;
        maxDecisions: number;
        promotionAuthority: string | null;
      };
  lab: {
    sourceIdentity: {
      sourceDigest: string;
      binaryDigest: string;
    };
    selector: {
      gameId: "hearts" | "spades" | "trix";
      variantId: "solo" | "partners" | "basic-solo" | "basic-partners" | "complex-solo" | "complex-partners";
      moduleVersion: string;
      ruleProfileId: string;
    };
    config: {
      [k: string]: unknown;
    };
    /**
     * @minItems 4
     */
    seatPolicies: {
      seat: number;
      id: string;
      version: string;
    }[];
    caps: {
      maxRounds: number;
      maxActions: number;
      maxTransitions: number;
      maxWallMs: number;
    };
    judge: {
      mode: "fixture";
      authorizedUsd: 0;
    };
    /**
     * @minItems 1
     */
    familyRoles: {
      id: string;
      role: "development" | "calibration-fit" | "calibration-audit" | "validation" | "confirmation";
    }[];
  };
};

export interface LabStrength {
  schemaVersion: "coach-lab-strength-1.0.0";
  studyId: string;
  stage: "development" | "fresh-validation";
  /**
   * @minItems 2
   * @maxItems 128
   */
  families: {
    id: string;
    seed: string;
  }[];
  /**
   * @minItems 1
   */
  rotations: number[];
  /**
   * @minItems 1
   */
  deployments: ("one-seat" | "both-partners")[];
  /**
   * @minItems 1
   * @maxItems 8
   */
  environments: {
    id: string;
    /**
     * @minItems 4
     * @maxItems 4
     */
    seatPolicies: {
      seat: number;
      id:
        | "trix-deterministic-1.0.0"
        | "trix-reasoning-1.0.0"
        | "trix-history-1.0.0"
        | "trix-frontier-1.0.0"
        | "trix-ownership-1.0.0"
        | "trix-ownership-comparison-1.0.0";
      version: "1.0.0";
    }[];
  }[];
  usefulGain: number;
  maximumHarm: number;
  minFamilies: number;
  powerRationale: string;
  multiplicityAdjustment: string;
}

export interface LabStudy {
  schemaVersion: "coach-lab-study-1.0.0";
  runId: string;
  privateEnvelopeHash: string;
  purpose: "development" | "confirmation";
  variant: string;
  /**
   * @minItems 0
   */
  families: {
    id: string;
    commitment: string;
  }[];
  validationReceipt: {
    validatorVersion: string;
    baseHash: string;
    confirmationEligible: boolean;
  };
}
