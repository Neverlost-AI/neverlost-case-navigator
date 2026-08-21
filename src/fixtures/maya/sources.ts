import type { SourceRecord } from "@/domain/contracts";

export const MAYA_SOURCES = [
  {
    id: "S01",
    title: "Connective-Tissue Specialist Assessment",
    scope: "medical_record",
    authorityLabel: "Synthetic specialist record",
    recordDate: "2023-11-08",
    excerpts: [
      "Assessment describes generalized joint hypermobility and a connective-tissue disorder under evaluation.",
      "The note recommends symptom-guided activity and coordinated primary-care follow-up.",
    ],
    synthetic: true,
  },
  {
    id: "S02",
    title: "Cardiology and Orthostatic Evaluation",
    scope: "medical_record",
    authorityLabel: "Synthetic cardiology record",
    recordDate: "2024-02-14",
    excerpts: [
      "Orthostatic measurements and the clinical assessment document findings consistent with POTS.",
      "Comprehensive autonomic testing has not yet been completed.",
    ],
    synthetic: true,
  },
  {
    id: "S03",
    title: "Primary-Care Establishment Note",
    scope: "medical_record",
    authorityLabel: "Synthetic primary-care record",
    recordDate: "2024-03-05",
    excerpts: [
      "The clinician records the need to reconcile specialty findings and review functional limitations at follow-up.",
    ],
    synthetic: true,
  },
  {
    id: "S04",
    title: "Prior Physical-Therapy Referral",
    scope: "referral_record",
    authorityLabel: "Synthetic referral record",
    recordDate: "2023-12-12",
    excerpts: [
      "Referral requests physical-therapy evaluation for joint stabilization and activity tolerance.",
    ],
    synthetic: true,
  },
  {
    id: "S05",
    title: "Client Functional and Work History Statement",
    scope: "client_statement",
    authorityLabel: "Client-reported synthetic statement",
    recordDate: "2024-04-01",
    excerpts: [
      "Maya reports difficulty sustaining computer activity for approximately 30 to 45 minutes before symptoms increase.",
      "Maya reports that breaks and position changes help her resume some tasks.",
    ],
    synthetic: true,
  },
  {
    id: "S06",
    title: "Former Employer Attendance and Accommodation Summary",
    scope: "employer_statement",
    authorityLabel: "Synthetic former-employer statement",
    recordDate: "2024-01-19",
    excerpts: [
      "The former employer reports recurring attendance interruptions and use of flexible breaks and remote-work accommodations.",
    ],
    synthetic: true,
  },
] as const satisfies readonly SourceRecord[];
