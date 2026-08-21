import type { Proposal } from "@/domain/contracts";

export const MAYA_PROPOSALS = [
  {
    id: "P01",
    statement: "Cardiology documented findings consistent with POTS.",
    origin: "source_derived",
    uncertainty: "supported",
    sourceIds: ["S02"],
    supportingExcerpts: [
      "Orthostatic measurements and the clinical assessment document findings consistent with POTS.",
    ],
    authorityLabel: "Synthetic cardiology record",
    outputSections: ["medical"],
    eligibleOutputs: ["ssa_disability_intake", "neurology_background"],
    timelineCandidate: {
      date: "2024-02-14",
      label: "Cardiology evaluation documented findings consistent with POTS.",
    },
    boundedEdits: [],
  },
  {
    id: "P02",
    statement: "Formal autonomic testing confirmed severe dysautonomia.",
    origin: "source_derived",
    uncertainty: "unsupported",
    sourceIds: ["S02"],
    supportingExcerpts: ["Comprehensive autonomic testing has not yet been completed."],
    authorityLabel: "Synthetic cardiology record",
    outputSections: ["medical"],
    eligibleOutputs: ["ssa_disability_intake", "neurology_background"],
    boundedEdits: [],
  },
  {
    id: "P03",
    statement:
      "Maya reports difficulty sustaining computer activity for approximately 30 to 45 minutes before symptoms increase.",
    origin: "client_reported",
    uncertainty: "client_reported",
    sourceIds: ["S05"],
    supportingExcerpts: [
      "Maya reports difficulty sustaining computer activity for approximately 30 to 45 minutes before symptoms increase.",
    ],
    authorityLabel: "Client-reported synthetic statement",
    outputSections: ["functional"],
    eligibleOutputs: ["ssa_disability_intake"],
    boundedEdits: [
      {
        id: "P03-E01",
        label: "Use the approved full-day repeatability clarification",
        correctedStatement:
          "Maya reports that she can sometimes use a computer for approximately 30 to 45 minutes before symptoms increase, but she cannot necessarily repeat that activity throughout a full day.",
      },
    ],
  },
  {
    id: "P04",
    statement:
      "A former employer reported recurring attendance interruptions and use of flexible breaks and remote-work accommodations.",
    origin: "source_derived",
    uncertainty: "supported",
    sourceIds: ["S06"],
    supportingExcerpts: [
      "The former employer reports recurring attendance interruptions and use of flexible breaks and remote-work accommodations.",
    ],
    authorityLabel: "Synthetic former-employer statement",
    outputSections: ["employer"],
    eligibleOutputs: ["ssa_disability_intake"],
    boundedEdits: [],
  },
  {
    id: "P05",
    statement:
      "A prior referral requested physical-therapy evaluation for joint stabilization and activity tolerance.",
    origin: "source_derived",
    uncertainty: "supported",
    sourceIds: ["S04"],
    supportingExcerpts: [
      "Referral requests physical-therapy evaluation for joint stabilization and activity tolerance.",
    ],
    authorityLabel: "Synthetic referral record",
    outputSections: ["referral"],
    eligibleOutputs: ["ssa_disability_intake", "neurology_background"],
    timelineCandidate: {
      date: "2023-12-12",
      label: "Physical-therapy referral requested evaluation for joint stabilization and activity tolerance.",
    },
    boundedEdits: [],
  },
  {
    id: "P06",
    statement: "Comprehensive autonomic testing remains missing evidence in this synthetic case.",
    origin: "missing_evidence",
    uncertainty: "missing_evidence",
    sourceIds: ["S02"],
    supportingExcerpts: ["Comprehensive autonomic testing has not yet been completed."],
    authorityLabel: "Synthetic cardiology record",
    outputSections: ["missing_evidence"],
    eligibleOutputs: ["ssa_disability_intake", "neurology_background"],
    boundedEdits: [],
  },
  {
    id: "P07",
    statement:
      "Primary-care review is needed to reconcile specialty findings and review functional limitations.",
    origin: "review_prompt",
    uncertainty: "needs_professional_review",
    sourceIds: ["S03"],
    supportingExcerpts: [
      "The clinician records the need to reconcile specialty findings and review functional limitations at follow-up.",
    ],
    authorityLabel: "Synthetic primary-care record",
    outputSections: ["pcp_review"],
    eligibleOutputs: ["ssa_disability_intake"],
    boundedEdits: [],
  },
  {
    id: "P08",
    statement:
      "A specialist assessment described generalized joint hypermobility and a connective-tissue disorder under evaluation.",
    origin: "source_derived",
    uncertainty: "supported",
    sourceIds: ["S01"],
    supportingExcerpts: [
      "Assessment describes generalized joint hypermobility and a connective-tissue disorder under evaluation.",
    ],
    authorityLabel: "Synthetic specialist record",
    outputSections: ["medical"],
    eligibleOutputs: ["ssa_disability_intake", "neurology_background"],
    timelineCandidate: {
      date: "2023-11-08",
      label: "Specialist assessment described joint hypermobility and a connective-tissue disorder under evaluation.",
    },
    boundedEdits: [],
  },
] as const satisfies readonly Proposal[];
