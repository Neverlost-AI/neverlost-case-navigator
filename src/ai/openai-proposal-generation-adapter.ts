import type { Proposal } from "@/domain/contracts";
import { generateSourceProposals } from "@/ai/generate-source-proposals";
import type { StructuredOutputRunner } from "@/ai/openai-client";
import { runStructuredOutput } from "@/ai/openai-client";
import type {
  ProposalGenerationAdapter,
  ProposalGenerationAdapterRequest,
  ProposalGenerationAdapterResponse,
} from "@/services/proposal-generation-adapter";

export class OpenAIProposalGenerationAdapter
  implements ProposalGenerationAdapter
{
  readonly provider = "openai" as const;

  constructor(private readonly runner: StructuredOutputRunner = runStructuredOutput) {}

  async generate(
    request: ProposalGenerationAdapterRequest,
  ): Promise<ProposalGenerationAdapterResponse> {
    if (request.sources.length !== 1) {
      throw new Error("The bounded OpenAI adapter accepts exactly one source per run.");
    }
    const source = request.sources[0];
    const generated = await generateSourceProposals(source, this.runner);
    const proposals: Proposal[] = generated.candidates.map((candidate, index) => ({
      id: `UNASSIGNED-${index + 1}`,
      statement: candidate.statement,
      origin: "ai_generated",
      uncertainty: candidate.uncertainty,
      sourceIds: [candidate.sourceId],
      supportingExcerpts: [candidate.supportingExcerpt],
      authorityLabel: source.authorityLabel,
      outputSections: candidate.outputSections,
      eligibleOutputs: candidate.eligibleOutputs,
      ...(candidate.timelineCandidate
        ? { timelineCandidate: candidate.timelineCandidate }
        : {}),
      boundedEdits: [],
    }));

    return {
      provider: this.provider,
      model: generated.model,
      providerResponseId: generated.responseId,
      proposals,
    };
  }
}
