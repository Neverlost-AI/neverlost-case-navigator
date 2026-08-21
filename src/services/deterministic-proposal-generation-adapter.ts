import type {
  ProposalGenerationAdapter,
  ProposalGenerationAdapterRequest,
  ProposalGenerationAdapterResponse,
} from "@/services/proposal-generation-adapter";
import { MAYA_PROPOSALS } from "@/fixtures/maya/proposals";

export class DeterministicProposalGenerationAdapter
  implements ProposalGenerationAdapter
{
  readonly provider = "deterministic" as const;

  async generate(
    request: ProposalGenerationAdapterRequest,
  ): Promise<ProposalGenerationAdapterResponse> {
    const sourceIds = new Set(request.sources.map((source) => source.id));
    return {
      provider: this.provider,
      model: "neverlost-deterministic-fixtures-v1",
      providerResponseId: null,
      proposals: structuredClone(
        MAYA_PROPOSALS.filter((proposal) =>
          proposal.sourceIds.some((sourceId) => sourceIds.has(sourceId)),
        ),
      ),
    };
  }
}
