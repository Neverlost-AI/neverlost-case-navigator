import type {
  AcceptedStatement,
  AiPacketDraft,
} from "@/domain/contracts";
import {
  OPENAI_MODEL,
  PacketDraftSchema,
} from "@/ai/schemas";
import {
  runStructuredOutput,
  type StructuredOutputRunner,
} from "@/ai/openai-client";

export const PACKET_DRAFT_INSTRUCTIONS = `Draft a disability-focused healthcare consulting packet from human-accepted synthetic case statements only.
Do not infer or add facts that are not present in those accepted statements.
Every paragraph and unresolved-evidence item must cite one or more accepted statement IDs supplied in the input.
Preserve client-reported and other source-authority labels in the wording.
Do not diagnose, determine disability, decide eligibility, claim SSA compliance, state that a person can or cannot work, or provide medical, legal, benefits, or other professional advice.
The result is an AI-generated synthetic draft for human review, not an official form, medical record, provider opinion, legal submission, or eligibility determination.`;

export const AI_PACKET_NOTICE =
  "AI-generated synthetic draft for human review. Not an official form and not medical, legal, benefits, or other professional advice.";

export async function draftDisabilityPacket(
  acceptedStatements: readonly AcceptedStatement[],
  runner: StructuredOutputRunner = runStructuredOutput,
): Promise<AiPacketDraft> {
  if (!acceptedStatements.length) {
    throw new Error("At least one human-accepted statement is required.");
  }

  const response = await runner({
    schema: PacketDraftSchema,
    schemaName: "neverlost_disability_packet_draft",
    instructions: PACKET_DRAFT_INSTRUCTIONS,
    input: JSON.stringify({
      synthetic: true,
      acceptedStatements: acceptedStatements.map((statement) => ({
        id: statement.id,
        text: statement.text,
        origin: statement.origin,
        uncertainty: statement.uncertainty,
        sourceIds: statement.sourceIds,
        authorityLabel: statement.authorityLabel,
        outputSections: statement.outputSections,
      })),
    }),
    maxOutputTokens: 3_000,
  });
  const content = PacketDraftSchema.parse(response.parsed);

  const acceptedIds = new Set(acceptedStatements.map((statement) => statement.id));
  const citedItems = [
    ...content.sections.flatMap((section) => section.paragraphs),
    ...content.unresolvedEvidence,
  ];
  for (const item of citedItems) {
    if (item.acceptedStatementIds.some((id) => !acceptedIds.has(id))) {
      throw new Error("OpenAI packet draft cited content outside accepted case state.");
    }
  }

  return {
    ...content,
    syntheticDraft: true,
    aiGenerated: true,
    model: OPENAI_MODEL,
    nonprofessionalAdviceNotice: AI_PACKET_NOTICE,
  };
}
