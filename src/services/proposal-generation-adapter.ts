import type {
  Proposal,
  ProposalGenerationProvider,
  SourceRecord,
} from "@/domain/contracts";

export interface ProposalGenerationAdapterRequest {
  localRunId: string;
  idempotencyKey: string;
  sources: readonly SourceRecord[];
}

export interface ProposalGenerationAdapterResponse {
  provider: ProposalGenerationProvider;
  model: string;
  providerResponseId: string | null;
  proposals: readonly Proposal[];
}

export interface ProposalGenerationAdapter {
  readonly provider: ProposalGenerationProvider;
  generate(
    request: ProposalGenerationAdapterRequest,
  ): Promise<ProposalGenerationAdapterResponse>;
}
