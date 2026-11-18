import { describe, expect, it, vi } from "vitest";
import { OpenAIRefusalError } from "@/ai/openai-client";
import type {
  StructuredOutputResponse,
  StructuredOutputRunner,
} from "@/ai/openai-client";
import { OpenAIProposalGenerationAdapter } from "@/ai/openai-proposal-generation-adapter";
import { MAYA_PROPOSALS } from "@/fixtures/maya/proposals";
import { MAYA_SOURCES } from "@/fixtures/maya/sources";
import { DeterministicProposalGenerationAdapter } from "@/services/deterministic-proposal-generation-adapter";
import { InMemoryCaseNavigatorService } from "@/services/in-memory-case-navigator";
import type { ProposalGenerationAdapter } from "@/services/proposal-generation-adapter";
import {
  orchestrateProposalGeneration,
} from "@/services/proposal-generation-orchestrator";
import { ProposalRunSequencer } from "@/services/proposal-run-sequencer";

const validExtraction = {
  candidates: [
    {
      statement: "Cardiology documented findings consistent with POTS.",
      supportingExcerpt:
        "Orthostatic measurements and the clinical assessment document findings consistent with POTS.",
      category: "medical",
      uncertainty: "supported",
      includeInTimeline: true,
      timelineLabel:
        "Cardiology evaluation documented findings consistent with POTS.",
    },
  ],
};

function runnerReturning(value: unknown): StructuredOutputRunner {
  return async <T>(): Promise<StructuredOutputResponse<T>> => ({
    parsed: value as T,
    responseId: "resp_mocked_s02",
    model: "gpt-5.6-terra",
  });
}

describe("provider-neutral proposal generation", () => {
  it("keeps the deterministic adapter deep-equivalent to the locked Maya proposals", async () => {
    const adapter = new DeterministicProposalGenerationAdapter();
    const result = await adapter.generate({
      localRunId: "deterministic-reference",
      idempotencyKey: "deterministic-reference:all",
      sources: MAYA_SOURCES,
    });

    expect(result.provider).toBe("deterministic");
    expect(result.proposals).toEqual(MAYA_PROPOSALS);
    expect(result.proposals).not.toBe(MAYA_PROPOSALS);
  });

  it("uses a provider-neutral adapter while reconstructing the canonical S02 fixture", async () => {
    const generate = vi.fn<ProposalGenerationAdapter["generate"]>(
      async () => ({
        provider: "deterministic",
        model: "test-adapter",
        providerResponseId: null,
        proposals: structuredClone(
          MAYA_PROPOSALS.filter((proposal) =>
            proposal.sourceIds.some((sourceId) => sourceId === "S02"),
          ),
        ),
      }),
    );
    const adapter: ProposalGenerationAdapter = {
      provider: "deterministic",
      generate,
    };
    const timestamps = [
      "2026-08-20T00:00:00.000Z",
      "2026-08-20T00:00:01.000Z",
    ];

    const result = await orchestrateProposalGeneration(
      {
        sourceIds: ["S02"],
        localRunId: "run-canonical-s02",
        idempotencyKey: "run-canonical-s02:S02",
      },
      adapter,
      { now: () => timestamps.shift()! },
    );

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ sources: [MAYA_SOURCES[1]] }),
    );
    expect(result.run).toMatchObject({
      provider: "deterministic",
      sourceIds: ["S02"],
      validationResult: "passed",
      status: "completed",
      startedAt: "2026-08-20T00:00:00.000Z",
      completedAt: "2026-08-20T00:00:01.000Z",
    });
    expect(result.run.sourceSetFingerprint).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(result.run.deterministicResultHash).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it("rejects source IDs outside the locked six-record fixture allowlist", async () => {
    const adapter = new DeterministicProposalGenerationAdapter();
    await expect(
      orchestrateProposalGeneration(
        {
          sourceIds: ["S07" as "S02"],
          localRunId: "run-invalid",
          idempotencyKey: "run-invalid:S07",
        },
        adapter,
      ),
    ).rejects.toThrow("Unknown synthetic source");
  });

  it("marks an older completion superseded without allowing it to replace a newer run", async () => {
    const sequencer = new ProposalRunSequencer();
    const older = sequencer.begin("S02");
    const newer = sequencer.begin("S02");
    const adapter = new OpenAIProposalGenerationAdapter(
      runnerReturning(validExtraction),
    );
    const olderResult = await orchestrateProposalGeneration(
      {
        sourceIds: ["S02"],
        localRunId: older.localRunId,
        idempotencyKey: older.idempotencyKey,
      },
      adapter,
    );
    const newerResult = await orchestrateProposalGeneration(
      {
        sourceIds: ["S02"],
        localRunId: newer.localRunId,
        idempotencyKey: newer.idempotencyKey,
      },
      adapter,
    );
    const service = new InMemoryCaseNavigatorService();

    expect(sequencer.isLatest(newer)).toBe(true);
    service.enqueueProposalGenerationResult(newerResult);
    expect(sequencer.isLatest(older)).toBe(false);
    service.recordSupersededProposalGenerationRun(olderResult.run);

    expect(service.listProposals()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generation: expect.objectContaining({ runId: newer.localRunId }),
        }),
      ]),
    );
    expect(
      service.listProposals().some(
        (proposal) => proposal.generation?.runId === older.localRunId,
      ),
    ).toBe(false);
    expect(service.listProposalGenerationRuns()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ localRunId: newer.localRunId, status: "completed" }),
        expect.objectContaining({ localRunId: older.localRunId, status: "superseded" }),
      ]),
    );
  });
});

describe("OpenAI proposal adapter outcomes", () => {
  it("returns validated, source-grounded proposals and provider metadata", async () => {
    const adapter = new OpenAIProposalGenerationAdapter(
      runnerReturning(validExtraction),
    );
    const result = await orchestrateProposalGeneration(
      {
        sourceIds: ["S02"],
        localRunId: "run-openai-s02",
        idempotencyKey: "run-openai-s02:S02",
      },
      adapter,
      { now: () => "2026-08-20T00:00:00.000Z" },
    );

    expect(result.run).toMatchObject({
      provider: "openai",
      model: "gpt-5.6-terra",
      providerResponseId: "resp_mocked_s02",
      candidateIds: [expect.stringMatching(/^AI-S02-[0-9a-f]{8}-01$/)],
    });
    expect(result.proposals[0]).toMatchObject({
      origin: "ai_generated",
      authorityLabel: "Synthetic cardiology record",
      supportingExcerpts: [validExtraction.candidates[0].supportingExcerpt],
      generation: {
        runId: "run-openai-s02",
        label: "AI-generated proposal for human review",
      },
    });
  });

  it("fails clearly on an OpenAI refusal", async () => {
    const runner: StructuredOutputRunner = async () => {
      throw new OpenAIRefusalError();
    };
    await expect(
      new OpenAIProposalGenerationAdapter(runner).generate({
        localRunId: "run-refusal",
        idempotencyKey: "run-refusal:S02",
        sources: [MAYA_SOURCES[1]],
      }),
    ).rejects.toBeInstanceOf(OpenAIRefusalError);
  });

  it("fails schema validation on malformed structured output", async () => {
    await expect(
      new OpenAIProposalGenerationAdapter(
        runnerReturning({ candidates: [{ statement: "Incomplete" }] }),
      ).generate({
        localRunId: "run-malformed",
        idempotencyKey: "run-malformed:S02",
        sources: [MAYA_SOURCES[1]],
      }),
    ).rejects.toThrow();
  });

  it("propagates API failures without creating proposals", async () => {
    const runner: StructuredOutputRunner = async () => {
      throw new Error("mock API unavailable");
    };
    await expect(
      new OpenAIProposalGenerationAdapter(runner).generate({
        localRunId: "run-api-failure",
        idempotencyKey: "run-api-failure:S02",
        sources: [MAYA_SOURCES[1]],
      }),
    ).rejects.toThrow("mock API unavailable");
  });
});
