import { z } from "zod";

export const OPENAI_MODEL = "gpt-5.6-terra" as const;

export const SourceIdSchema = z.enum(["S01", "S02", "S03", "S04", "S05", "S06"]);

export const ProposalExtractionSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            statement: z.string().min(1).max(240),
            supportingExcerpt: z.string().min(1).max(1_000),
            category: z.enum([
              "medical",
              "functional",
              "employer",
              "referral",
              "missing_evidence",
              "pcp_review",
            ]),
            uncertainty: z.enum([
              "supported",
              "unsupported",
              "client_reported",
              "missing_evidence",
              "needs_professional_review",
            ]),
            includeInTimeline: z.boolean(),
            timelineLabel: z.string().min(1).max(500).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(2),
  })
  .strict();

export const AcceptedStatementInputSchema = z
  .object({
    id: z.string().min(1),
    proposalId: z.string().min(1),
    text: z.string().min(1).max(2_000),
    origin: z.enum([
      "source_derived",
      "client_reported",
      "missing_evidence",
      "review_prompt",
      "ai_generated",
    ]),
    uncertainty: z.enum([
      "supported",
      "unsupported",
      "client_reported",
      "missing_evidence",
      "needs_professional_review",
    ]),
    sourceIds: z.array(SourceIdSchema).min(1).max(6),
    authorityLabel: z.string().min(1).max(300),
    outputSections: z
      .array(
        z.enum([
          "medical",
          "functional",
          "employer",
          "referral",
          "missing_evidence",
          "pcp_review",
        ]),
      )
      .min(1),
    eligibleOutputs: z
      .array(z.enum(["ssa_disability_intake", "neurology_background"]))
      .min(1),
    acceptedAtRevision: z.number().int().positive(),
    edited: z.boolean(),
  })
  .strict();

const CitedParagraphSchema = z
  .object({
    text: z.string().min(1).max(2_000),
    acceptedStatementIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const PacketDraftSchema = z
  .object({
    title: z.literal("OpenAI-assisted Disability Case Packet — Synthetic Draft"),
    sections: z
      .array(
        z
          .object({
            id: z.enum([
              "medical",
              "functional",
              "employer",
              "referral",
              "missing_evidence",
              "pcp_review",
            ]),
            title: z.string().min(1).max(200),
            paragraphs: z.array(CitedParagraphSchema).min(1),
          })
          .strict(),
      )
      .min(1),
    unresolvedEvidence: z.array(CitedParagraphSchema),
  })
  .strict();

export type ProposalExtraction = z.infer<typeof ProposalExtractionSchema>;
export type PacketDraftContent = z.infer<typeof PacketDraftSchema>;
