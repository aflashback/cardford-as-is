// GENERATED from contracts/trix-scenario-collection/*.schema.json. Do not edit.
export interface TrixScenarioCampaignPlan {
  schemaVersion: "trix-scenario-campaign-plan-1.0.0";
  status: "proposed-not-executable" | "approved-for-implementation";
  corpusId: string;
  scope: "offline-discovery-only";
  model: {
    requested: "gpt-6-luna";
    reasoningEffort: "max";
    fallbackAllowed: false;
  };
  execution: {
    transport: "host-assisted-subagent-bridge";
    /**
     * @minItems 4
     * @maxItems 4
     */
    logicalSeats: ["S", "E", "N", "W"];
    maxConcurrentPlayerInvocations: 1;
    maxConcurrentEpisodes: 1;
    context: "fresh-per-invocation";
    forkTurns: "none";
    toolCallsAllowed: 0;
    uninspectableInvocation: "stop";
    missingModelOrEffortAttestation: "stop";
    /**
     * @minItems 4
     * @maxItems 4
     */
    phaseOrder: ["basic-solo", "complex-solo", "basic-partners", "complex-partners"];
  };
  pins: {
    gameId: "trix";
    moduleVersion: "2.2.0";
    stateSchemaVersion: "1.2.0";
    observationSchemaVersion: "1.2.0";
    publicSchemaVersion: "1.2.0";
    eventSchemaVersion: "1.0.0";
  };
  /**
   * @minItems 4
   * @maxItems 4
   */
  phases: [
    {
      variant: "basic-solo";
      ruleProfileId: "trix-basic-solo-1.0.0";
      objective: "own-request-points";
      /**
       * @minItems 4
       * @maxItems 4
       */
      requests: ["diamonds", "king", "queens", "lutoosh"];
      targetCases: number;
      maxCases: number;
      requestTargets: {
        diamonds: number;
        king: number;
        queens: number;
        lutoosh: number;
      };
      maxCompletedRequests: number;
      maxRequestsPerContract: number;
    },
    {
      variant: "complex-solo";
      ruleProfileId: "trix-complex-solo-1.0.0";
      objective: "own-request-points";
      /**
       * @minItems 1
       * @maxItems 1
       */
      requests: ["complex"];
      targetCases: number;
      maxCases: number;
      requestTargets: {
        complex: number;
      };
      maxCompletedRequests: number;
      maxRequestsPerContract: number;
    },
    {
      variant: "basic-partners";
      ruleProfileId: "trix-basic-partners-1.1.0";
      objective: "combined-team-request-points";
      /**
       * @minItems 4
       * @maxItems 4
       */
      requests: ["diamonds", "king", "queens", "lutoosh"];
      targetCases: number;
      maxCases: number;
      requestTargets: {
        diamonds: number;
        king: number;
        queens: number;
        lutoosh: number;
      };
      maxCompletedRequests: number;
      maxRequestsPerContract: number;
    },
    {
      variant: "complex-partners";
      ruleProfileId: "trix-complex-partners-1.1.0";
      objective: "combined-team-request-points";
      /**
       * @minItems 1
       * @maxItems 1
       */
      requests: ["complex"];
      targetCases: number;
      maxCases: number;
      requestTargets: {
        complex: number;
      };
      maxCompletedRequests: number;
      maxRequestsPerContract: number;
    }
  ];
  selection: {
    maxCorpusCases: number;
    countUnit: "unique-actor-decision";
    retainAllRawAttempts: true;
    maxCasesPerPhysicalDealFamily: number;
    forcedCasesInStrategicQuota: false;
    scheduledRequestChoicesInQuota: false;
    incompleteEpisodesInQuota: false;
    deduplicateAcrossRuns: true;
    categoryVersion: "trix-penalty-taxonomy-1.0.0";
    maxAuthoredRequestFraction: 0.25;
  };
  workCaps: {
    pilot: {
      variant: "basic-solo";
      /**
       * @minItems 4
       * @maxItems 4
       */
      requests: ["diamonds", "king", "queens", "lutoosh"];
    };
    batchRequests: number;
    maxPlayerAttemptsPerDecision: number;
    maxInvocationWallMs: number;
    maxActiveSegmentWallMs: number;
    maxAttemptedEpisodes: number;
    maxPlayerAttemptsCampaign: number;
    onLimit: "checkpoint-and-report-shortfall";
    dollarBudget: "no-separate-paid-provider-authorized";
    reviewTransport: "current-host-independent-review-context";
  };
  versions: {
    playerPrompt: "trix-luna-player-1.0.0";
    declarationPrompt: "trix-luna-declaration-1.0.0";
    reviewPrompt: "trix-luna-review-1.0.0";
    gameReviewPrompt: "trix-luna-game-review-1.0.0";
    packetProjection: "trix-scenario-player-packet-1.0.0";
  };
  exclusions: {
    /**
     * @minItems 1
     * @maxItems 1
     */
    requests: ["trix"];
    /**
     * @minItems 3
     * @maxItems 3
     */
    games: ["spades", "hearts", "tarneeb"];
    training: true;
    runtimeModelIntegration: true;
    automaticPromotion: true;
  };
}

export interface TrixCoachingCase {
  schemaVersion: "trix-coaching-case-1.0.0";
  corpusId: string;
  caseId: string;
  runId: string;
  decisionId: string;
  episodeId: string;
  revision: number;
  familyId: string;
  variant: "basic-solo" | "complex-solo" | "basic-partners" | "complex-partners";
  request: "diamonds" | "king" | "queens" | "lutoosh" | "complex";
  pin: {
    gameId: "trix";
    variantId: "basic-solo" | "complex-solo" | "basic-partners" | "complex-partners";
    moduleVersion: "2.2.0";
    ruleProfileId:
      "trix-basic-solo-1.0.0" | "trix-complex-solo-1.0.0" | "trix-basic-partners-1.1.0" | "trix-complex-partners-1.1.0";
    stateSchemaVersion: "1.2.0";
    observationSchemaVersion: "1.2.0";
    publicSchemaVersion: "1.2.0";
    eventSchemaVersion: "1.0.0";
  };
  objective: "own-request-points" | "combined-team-request-points";
  actor: number;
  stage: "declaration" | "opening" | "middle" | "late";
  primaryCategory: "DIA" | "HK" | "Q" | "LUT" | "VOID" | "COMB" | "DBL" | "INFER" | "END" | "TEAM";
  /**
   * @minItems 1
   */
  tags: ("DIA" | "HK" | "Q" | "LUT" | "VOID" | "COMB" | "DBL" | "INFER" | "END" | "TEAM")[];
  actorPacket: TrixScenarioPlayerPacket;
  originalChoice: string;
  originalRationale: string;
  selfReportedConfidence: number;
  rationaleAssessment:
    "adequate" | "incomplete-explanation" | "unsupported-claim" | "incorrect-fact" | "uncertain" | "forced";
  actionAssessment: "supported-for-testing" | "ambiguous" | "counterexample" | "proved-correction";
  missedOpportunity: null | {
    alternativeCandidateId: string;
    objective: "own-request-points" | "combined-team-request-points";
    advantage: number;
    proofKind: "native-objective-dominance" | "information-set-exhaustive";
    proofRef: {
      path: string;
      sha256: string;
    };
    /**
     * @minItems 1
     */
    actorEvidenceRefs: string[];
    correction: string;
  };
  /**
   * @minItems 3
   */
  evidenceRefs: {
    kind: "actor-review" | "original-response" | "reviewer-receipt";
    path: string;
    sha256: string;
  }[];
  retrospectiveRef: {
    path: string;
    sha256: string;
  };
  eligibilityReceipt: {
    nativeLegal: true;
    nonForced: true;
    episodeComplete: true;
    replayVerified: true;
    actorReviewFrozen: true;
    gameReviewFrozen: true;
    materialChecksSupported: boolean;
    correctionVerified: boolean;
  };
  limitations: string[];
  provenance: "offline-llm-player";
  promotionEligible: false;
  runtimeActivated: false;
  exactDecisionFingerprint: string;
  acceptedProofReceiptRef: null | {
    path: string;
    sha256: string;
  };
}

export interface TrixScenarioDecisionReview {
  decisionId: string;
  packetHash: string;
  reviewVersion: "trix-luna-review-1.0.0";
  provenance: "llm-proposal";
  rationaleStatus:
    "adequate" | "incomplete-explanation" | "unsupported-claim" | "incorrect-fact" | "uncertain" | "forced";
  /**
   * @minItems 5
   * @maxItems 5
   */
  checks: {
    id: "facts" | "objective" | "material-alternatives" | "tactical-purpose" | "uncertainty";
    status: "supported" | "issue" | "unknown";
    explanation: string;
    /**
     * @minItems 1
     */
    evidenceRefs: string[];
  }[];
  /**
   * @minItems 1
   */
  categoryIds: ("DIA" | "HK" | "Q" | "LUT" | "VOID" | "COMB" | "DBL" | "INFER" | "END" | "TEAM")[];
  /**
   * @minItems 0
   */
  explanationIssues: {
    description: string;
    /**
     * @minItems 1
     */
    evidenceRefs: string[];
  }[];
  /**
   * @minItems 0
   */
  hypotheses: {
    description: string;
    assumptions: string[];
    counterexamplesToSeek: string[];
  }[];
  missedOpportunity: null | {
    alternativeCandidateId: string;
    objective: "own-request-points" | "combined-team-request-points";
    advantage: number;
    proofKind: "native-objective-dominance" | "information-set-exhaustive";
    proofRef: {
      path: string;
      sha256: string;
    };
    /**
     * @minItems 1
     */
    actorEvidenceRefs: string[];
    correction: string;
  };
  limitations: string[];
}

export interface TrixScenarioDeclarationResponse {
  /**
   * @maxItems 5
   */
  cards: string[];
  reasoning: string;
  confidence: number;
}

export interface TrixCaseExport {
  schemaVersion: "trix-case-export-1.0.0";
  exportVersion: string;
  runId: string;
  corpusId: string;
  mode: "live" | "fixture";
  planHash: string;
  sourceDigest: null | string;
  binaryDigest: null | string;
  caseCount: number;
  files: {
    "cases.jsonl": string;
    "coverage.json": string;
    "category-strategies.jsonl": string;
    "casebook.md": string;
    "game-findings.jsonl": string;
  };
  privateLineageRef: {
    path: string;
    sha256: string;
  };
  provenance: "offline-llm-player";
  promotionEligible: false;
  runtimeActivated: false;
}

export interface TrixPublicGameFinding {
  schemaVersion: "trix-public-game-finding-1.0.0";
  episodeId: string;
  variant: "basic-solo" | "complex-solo" | "basic-partners" | "complex-partners";
  request: "diamonds" | "king" | "queens" | "lutoosh" | "complex";
  nativeTotals: {
    /**
     * @minItems 1
     */
    scoreTotals: {
      id: string;
      /**
       * @minItems 1
       * @maxItems 2
       */
      seats: number[];
      total: number;
    }[];
    componentTotals: {
      [k: string]: {
        [k: string]: number;
      };
    };
  };
  /**
   * @minItems 13
   * @maxItems 13
   */
  publicTricks: {
    number: number;
    leader: 0 | 1 | 2 | 3;
    winner: 0 | 1 | 2 | 3;
    /**
     * @minItems 4
     * @maxItems 4
     */
    plays: {
      seat: 0 | 1 | 2 | 3;
      card: string;
    }[];
  }[];
  nativeLedger: {
    dealNumber: number;
    kingdom: number;
    request: "diamonds" | "lutoosh" | "queens" | "king" | "complex" | "trix";
    trick: number;
    finish: number;
    recipient:
      | {
          kind: "seat";
          seat: 0 | 1 | 2 | 3;
        }
      | {
          kind: "competitor";
          competitor: string;
        };
    component: "diamond" | "trick" | "queen" | "king" | "double-bonus" | "layout-finish";
    card?: string;
    delta: number;
    declarationRef?: string;
    leadSourceRef?: string;
  }[];
  withheldBonuses: {
    dealNumber: number;
    trick: number;
    card: string;
    bonusValue: 25 | 75;
    reason: "no_previous_external_leader";
    declarationRef: string;
  }[];
  gameReview: TrixScenarioGameReview;
  frozenDecisionReviewDigest: string;
  provenance: "offline-llm-player";
  promotionEligible: false;
  runtimeActivated: false;
}

export interface TrixScenarioGameReview {
  episodeId: string;
  reviewVersion: "trix-luna-game-review-1.0.0";
  provenance: "llm-proposal";
  complete: true;
  quality: "supported" | "mixed" | "insufficient-evidence";
  summary: string;
  /**
   * @minItems 4
   * @maxItems 4
   */
  seatSummaries: {
    actor: number;
    summary: string;
    reviewedDecisions: number;
    uncertainty: string[];
    correctionDecisionIds: string[];
  }[];
  nativeTotals: {
    /**
     * @minItems 1
     */
    scoreTotals: TrixReviewScore[];
    componentTotals: {
      [k: string]: {
        [k: string]: number;
      };
    };
  };
  supportedMissedOpportunityRefs: string[];
  explanationIssueCounts: {
    adequate: number;
    "incomplete-explanation": number;
    "unsupported-claim": number;
    "incorrect-fact": number;
    uncertain: number;
    forced: number;
  };
  usefulPatternRefs: string[];
  counterexampleRefs: string[];
  limitations: string[];
}

export interface TrixScenarioPlayerPacket {
  schemaVersion: "trix-scenario-player-packet-1.0.0";
  invocationId: string;
  actor: number;
  actorLabel: "S" | "W" | "N" | "E";
  nativeRevision: number;
  gameId: "trix";
  variant: "basic-solo" | "complex-solo" | "basic-partners" | "complex-partners";
  request: "diamonds" | "king" | "queens" | "lutoosh" | "complex";
  pin: {
    gameId: "trix";
    variantId: "basic-solo" | "complex-solo" | "basic-partners" | "complex-partners";
    moduleVersion: "2.2.0";
    ruleProfileId:
      "trix-basic-solo-1.0.0" | "trix-complex-solo-1.0.0" | "trix-basic-partners-1.1.0" | "trix-complex-partners-1.1.0";
    stateSchemaVersion: "1.2.0";
    observationSchemaVersion: "1.2.0";
    publicSchemaVersion: "1.2.0";
    eventSchemaVersion: "1.0.0";
  };
  sharedRulesHash: string;
  sharedGameDescriptor: {
    gameId: "trix";
    variant: "basic-solo" | "complex-solo" | "basic-partners" | "complex-partners";
    request: "diamonds" | "king" | "queens" | "lutoosh" | "complex";
    pin: {
      gameId: "trix";
      variantId: "basic-solo" | "complex-solo" | "basic-partners" | "complex-partners";
      moduleVersion: "2.2.0";
      ruleProfileId:
        | "trix-basic-solo-1.0.0"
        | "trix-complex-solo-1.0.0"
        | "trix-basic-partners-1.1.0"
        | "trix-complex-partners-1.1.0";
      stateSchemaVersion: "1.2.0";
      observationSchemaVersion: "1.2.0";
      publicSchemaVersion: "1.2.0";
      eventSchemaVersion: "1.0.0";
    };
    name: string;
    description: string;
  };
  rulesAndScoring: string;
  seatAndCompetition: {
    actor: number;
    actorLabel: "S" | "W" | "N" | "E";
    mode: "solo" | "partners";
    /**
     * @minItems 2
     * @maxItems 4
     */
    competitors: {
      id: string;
      /**
       * @minItems 1
       * @maxItems 2
       */
      seats: number[];
      /**
       * @minItems 1
       * @maxItems 2
       */
      seatLabels: ("S" | "W" | "N" | "E")[];
    }[];
    partner: number | null;
  };
  objective: "own-request-points" | "combined-team-request-points";
  /**
   * @minItems 0
   * @maxItems 13
   */
  ownHand: string[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  handCounts: number[];
  publicPhaseAndTurn: {
    phase: "playing" | "declare-doubles";
    turn: number;
    turnLabel: "S" | "W" | "N" | "E";
    kingdom: number;
    dealNumber: number;
    h7Owner: number;
    h7OwnerLabel: "S" | "W" | "N" | "E";
    turnOrder: ["S", "E", "N", "W"];
  };
  /**
   * @minItems 0
   * @maxItems 4
   */
  declarations: {
    actor: number;
    actorLabel: "S" | "W" | "N" | "E";
    /**
     * @minItems 0
     * @maxItems 5
     */
    cards: string[];
    ref: string;
  }[];
  /**
   * @minItems 0
   * @maxItems 13
   */
  completedTricks: {
    number: number;
    leader: number;
    leaderLabel: "S" | "W" | "N" | "E";
    winner: number;
    winnerLabel: "S" | "W" | "N" | "E";
    /**
     * @minItems 4
     * @maxItems 4
     */
    plays: {
      actor: number;
      actorLabel: "S" | "W" | "N" | "E";
      card: string;
    }[];
    /**
     * @minItems 0
     * @maxItems 10000
     */
    scoreComponents: TrixLedgerEntry[];
  }[];
  currentTrick: {
    /**
     * @minItems 0
     * @maxItems 3
     */
    plays: {
      actor: number;
      actorLabel: "S" | "W" | "N" | "E";
      card: string;
    }[];
    winningActor: number | null;
    winningActorLabel: ("S" | "W" | "N" | "E") | null;
    /**
     * @minItems 0
     * @maxItems 4
     */
    stillToAct: number[];
  };
  publicScoresAndBonusFacts: {
    /**
     * @minItems 2
     * @maxItems 4
     */
    totals: TrixScore[];
    /**
     * @minItems 2
     * @maxItems 4
     */
    requestTotals: TrixScore[];
    /**
     * @minItems 2
     * @maxItems 4
     */
    kingdomTotals: TrixScore[];
    requestSeatTotals: number[] | null;
    /**
     * @minItems 0
     * @maxItems 10000
     */
    ledger: TrixLedgerEntry[];
    /**
     * @minItems 0
     * @maxItems 10000
     */
    withheldBonuses: TrixWithheldBonus[];
    /**
     * @minItems 4
     * @maxItems 4
     */
    lastExternalLeader: (TrixLeadSource | null)[];
  };
  /**
   * @minItems 1
   * @maxItems 32
   */
  legalOptions: (
    | {
        candidateId: string;
        kind: "play-card";
        card: string;
      }
    | {
        candidateId: string;
        kind: "declare-doubles";
        /**
         * @minItems 0
         * @maxItems 5
         */
        cards: string[];
      }
  )[];
}

export interface TrixScenarioPlayResponse {
  card: string;
  reasoning: string;
  confidence: number;
}

export interface TrixCategoryStrategy {
  schemaVersion: "trix-category-strategy-1.0.0";
  id: string;
  categoryId: "DIA" | "HK" | "Q" | "LUT" | "VOID" | "COMB" | "DBL" | "INFER" | "END" | "TEAM";
  /**
   * @minItems 1
   */
  variants: ("basic-solo" | "complex-solo" | "basic-partners" | "complex-partners")[];
  /**
   * @minItems 1
   */
  requests: ("diamonds" | "king" | "queens" | "lutoosh" | "complex")[];
  objective: "own-request-points" | "combined-team-request-points";
  observableTrigger: string;
  actionPrinciple: string;
  /**
   * @minItems 1
   */
  supportingCaseIds: string[];
  counterexampleCaseIds: string[];
  /**
   * @minItems 1
   */
  assumptions: string[];
  /**
   * @minItems 1
   */
  doNotApplyWhen: string[];
  evidenceLevel: "hypothesis" | "supported-for-testing" | "disputed";
  coachCueDraft: string;
  whyDraft: string;
  /**
   * @minItems 1
   */
  validationNeeded: string[];
  provenance: "offline-llm-player";
  promotionEligible: false;
  runtimeActivated: false;
}
