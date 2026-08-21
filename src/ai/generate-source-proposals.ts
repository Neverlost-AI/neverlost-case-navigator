import type {
  AiProposalCandidate,
  OutputKind,
  OutputSection,
  SourceRecord,
  SourceScope,
  UncertaintyLabel,
} from "@/domain/contracts";
import {
  OPENAI_MODEL,
  ProposalExtractionSchema,
} from "@/ai/schemas";
import {
  runStructuredOutput,
  type StructuredOutputRunner,
} from "@/ai/openai-client";

export const PROPOSAL_EXTRACTION_INSTRUCTIONS = `You analyze one fully synthetic Neverlost Case Navigator source record.
Extract evidence-preserving candidate facts, events, or explicit missing-evidence statements for human review.
Every candidate must be grounded in one exact supporting excerpt supplied in the source record; copy that excerpt verbatim.
Preserve client-reported, employer-reported, referral, and clinician-record authority boundaries.
Do not decide whether a diagnosis is true, whether the client is disabled, whether benefits should be awarded, whether a person can work, or whether any legal or SSA standard is satisfied.
Do not invent durations, frequencies, tests, findings, conclusions, dates, providers, or records.
Candidates are proposals only. A human reviewer decides whether anything enters accepted case state.`;

export interface GeneratedSourceProposals {
  candidates: readonly AiProposalCandidate[];
  responseId: string;
  model: string;
}

const CATEGORY_OUTPUTS: Record<
  OutputSection,
  readonly OutputKind[]
> = {
  medical: ["ssa_disability_intake", "neurology_background"],
  functional: ["ssa_disability_intake"],
  employer: ["ssa_disability_intake"],
  referral: ["ssa_disability_intake", "neurology_background"],
  missing_evidence: ["ssa_disability_intake", "neurology_background"],
  pcp_review: ["ssa_disability_intake"],
};

const ALLOWED_CATEGORIES: Record<SourceScope, readonly OutputSection[]> = {
  medical_record: ["medical", "missing_evidence", "pcp_review"],
  referral_record: ["referral"],
  client_statement: ["functional"],
  employer_statement: ["employer"],
};

const PROHIBITED_AUTHORITY_CLAIMS = [
  /formal autonomic testing (?:confirmed|showed|established)/i,
  /severe dysautonomia/i,
  /(?:is|was) disabled/i,
  /(?:cannot|unable to) work/i,
  /(?:eligible for|award|approve) benefits/i,
];

function validateUncertainty(
  scope: SourceScope,
  uncertainty: UncertaintyLabel,
): void {
  if (scope === "client_statement" && uncertainty !== "client_reported") {
    throw new Error("Client statements must remain labeled client-reported.");
  }
  if (
    (scope === "employer_statement" || scope === "referral_record") &&
    uncertainty === "client_reported"
  ) {
    throw new Error("AI proposal uncertainty conflicts with source authority.");
  }
}

export async function generateSourceProposals(
  source: SourceRecord,
  runner: StructuredOutputRunner = runStructuredOutput,
): Promise<GeneratedSourceProposals> {
  if (!source.synthetic) {
    throw new Error("Only synthetic source fixtures may be analyzed.");
  }

  const response = await runner({
    schema: ProposalExtractionSchema,
    schemaName: "neverlost_source_proposals",
    instructions: PROPOSAL_EXTRACTION_INSTRUCTIONS,
    input: JSON.stringify({
      synthetic: true,
      sourceId: source.id,
      title: source.title,
      scope: source.scope,
      authorityLabel: source.authorityLabel,
      recordDate: source.recordDate,
      exactExcerpts: source.excerpts,
    }),
    maxOutputTokens: 1_000,
  });

  const result = ProposalExtractionSchema.parse(response.parsed);

  const candidates = result.candidates.map((candidate) => {
    if (PROHIBITED_AUTHORITY_CLAIMS.some((pattern) => pattern.test(candidate.statement))) {
      throw new Error("OpenAI proposal asserted a prohibited authority conclusion.");
    }
    if (!source.excerpts.includes(candidate.supportingExcerpt)) {
      throw new Error(
        `OpenAI cited text that is not a preserved excerpt in ${source.id}.`,
      );
    }
    if (!ALLOWED_CATEGORIES[source.scope].includes(candidate.category)) {
      throw new Error(
        `OpenAI category ${candidate.category} conflicts with ${source.scope}.`,
      );
    }
    validateUncertainty(source.scope, candidate.uncertainty);
    if (candidate.includeInTimeline && !candidate.timelineLabel) {
      throw new Error("A timeline-eligible proposal requires a timeline label.");
    }
    if (
      candidate.includeInTimeline &&
      !["medical", "referral"].includes(candidate.category)
    ) {
      throw new Error("Only medical or referral evidence may create a timeline candidate.");
    }

    return {
      statement: candidate.statement,
      sourceId: source.id,
      supportingExcerpt: candidate.supportingExcerpt,
      uncertainty: candidate.uncertainty,
      outputSections: [candidate.category],
      eligibleOutputs: CATEGORY_OUTPUTS[candidate.category],
      ...(candidate.includeInTimeline && candidate.timelineLabel
        ? {
            timelineCandidate: {
              date: source.recordDate,
              label: candidate.timelineLabel,
            },
          }
        : {}),
      generatedByModel: OPENAI_MODEL,
    } satisfies AiProposalCandidate;
  });

  return {
    candidates,
    responseId: response.responseId,
    model: response.model,
  };
}
