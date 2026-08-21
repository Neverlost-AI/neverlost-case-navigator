import type {
  Proposal,
  ProposalGenerationResult,
  SourceRecord,
} from "@/domain/contracts";
import { MAYA_SOURCES } from "@/fixtures/maya/sources";
import type { ProposalGenerationAdapter } from "@/services/proposal-generation-adapter";

export const PROPOSAL_SCHEMA_VERSION = "neverlost-proposal-v1";
export const PROPOSAL_INSTRUCTION_VERSION = "source-extraction-v1";

export interface ProposalGenerationRequest {
  localRunId: string;
  idempotencyKey: string;
  sourceIds: readonly SourceRecord["id"][];
}

export interface ProposalGenerationOrchestratorOptions {
  now?: () => string;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deterministicFingerprint(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

function canonicalSources(
  sourceIds: readonly SourceRecord["id"][],
): readonly SourceRecord[] {
  if (sourceIds.length !== 1) {
    throw new Error("This bounded tranche accepts exactly one synthetic source per run.");
  }
  const unique = new Set(sourceIds);
  if (unique.size !== sourceIds.length) {
    throw new Error("Duplicate synthetic source IDs are not allowed.");
  }
  return sourceIds.map((sourceId) => {
    const source = MAYA_SOURCES.find((item) => item.id === sourceId);
    if (!source) {
      throw new Error(`Unknown synthetic source: ${String(sourceId)}`);
    }
    return structuredClone(source);
  });
}

function validateProposal(
  proposal: Proposal,
  sources: readonly SourceRecord[],
): void {
  if (proposal.sourceIds.length !== 1) {
    throw new Error("Generated proposals must cite exactly one requested source.");
  }
  const source = sources.find((item) => item.id === proposal.sourceIds[0]);
  if (!source) {
    throw new Error("Generated proposal cited an unauthorized source.");
  }
  if (
    proposal.supportingExcerpts.length !== 1 ||
    !source.excerpts.includes(proposal.supportingExcerpts[0])
  ) {
    throw new Error(`Generated proposal is not grounded in an exact ${source.id} excerpt.`);
  }
}

export async function orchestrateProposalGeneration(
  request: ProposalGenerationRequest,
  adapter: ProposalGenerationAdapter,
  options: ProposalGenerationOrchestratorOptions = {},
): Promise<ProposalGenerationResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const sources = canonicalSources(request.sourceIds);
  const response = await adapter.generate({
    localRunId: request.localRunId,
    idempotencyKey: request.idempotencyKey,
    sources,
  });
  if (response.provider !== adapter.provider) {
    throw new Error("Proposal-generation provider response did not match its adapter.");
  }
  response.proposals.forEach((proposal) => validateProposal(proposal, sources));

  const resultHash = deterministicFingerprint(response.proposals);
  const runToken = deterministicFingerprint(request.idempotencyKey).split(":")[1];
  const proposals = response.proposals.map((proposal, index) =>
    response.provider === "openai"
      ? {
          ...proposal,
          id: `AI-${proposal.sourceIds[0]}-${runToken}-${String(index + 1).padStart(2, "0")}`,
          generation: {
            kind: "openai" as const,
            model: "gpt-5.6-terra" as const,
            label: "AI-generated proposal for human review" as const,
            runId: request.localRunId,
          },
        }
      : proposal,
  );
  const completedAt = now();

  return {
    run: {
      localRunId: request.localRunId,
      provider: response.provider,
      model: response.model,
      providerResponseId: response.providerResponseId,
      schemaVersion: PROPOSAL_SCHEMA_VERSION,
      instructionVersion: PROPOSAL_INSTRUCTION_VERSION,
      sourceIds: request.sourceIds,
      sourceSetFingerprint: deterministicFingerprint(sources),
      startedAt,
      completedAt,
      validationResult: "passed",
      candidateIds: proposals.map((proposal) => proposal.id),
      deterministicResultHash: resultHash,
      idempotencyKey: request.idempotencyKey,
      status: "completed",
    },
    proposals,
  };
}
