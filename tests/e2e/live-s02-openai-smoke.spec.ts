import { expect, test } from "@playwright/test";
import type { ProposalGenerationResult } from "@/domain/contracts";
import { MAYA_SOURCES } from "@/fixtures/maya/sources";
import { InMemoryCaseNavigatorService } from "@/services/in-memory-case-navigator";

test("authorized live S02 OpenAI proposal smoke", async ({ request }) => {
  test.skip(
    process.env.RUN_LIVE_OPENAI_SMOKE !== "authorized-once",
    "This cost-bearing test requires explicit one-run authorization.",
  );

  const service = new InMemoryCaseNavigatorService();
  const before = {
    caseSummary: service.getCase(),
    acceptedStatements: service.getAcceptedStatements(),
    timeline: service.getTimeline(),
    ssaOutput: service.getOutput("ssa_disability_intake"),
    neurologyOutput: service.getOutput("neurology_background"),
    proposalCount: service.listProposals().length,
  };

  const response = await request.post("/api/ai/proposals", {
    data: {
      sourceIds: ["S02"],
      localRunId: "live-s02-smoke-0001",
      idempotencyKey: "live-s02-smoke-0001:S02",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const result = (await response.json()) as ProposalGenerationResult;
  const source = MAYA_SOURCES.find((item) => item.id === "S02")!;

  expect(result.run).toMatchObject({
    localRunId: "live-s02-smoke-0001",
    provider: "openai",
    model: expect.stringContaining("gpt-5.6-terra"),
    sourceIds: ["S02"],
    validationResult: "passed",
    idempotencyKey: "live-s02-smoke-0001:S02",
    status: "completed",
  });
  expect(result.run.providerResponseId).toMatch(/^resp_/);
  expect(result.proposals.length).toBeGreaterThan(0);
  expect(result.proposals).toHaveLength(result.run.candidateIds.length);
  expect(result.proposals.length).toBeLessThanOrEqual(2);
  for (const proposal of result.proposals) {
    expect(proposal.statement.length).toBeLessThanOrEqual(240);
    expect(proposal.sourceIds).toEqual(["S02"]);
    expect(proposal.supportingExcerpts).toHaveLength(1);
    expect(source.excerpts).toContain(proposal.supportingExcerpts[0]);
    expect(proposal.origin).toBe("ai_generated");
    expect(proposal.generation?.runId).toBe(result.run.localRunId);
    expect(proposal.statement).not.toMatch(
      /formal autonomic testing (?:confirmed|showed|established)|severe dysautonomia|(?:is|was) disabled|(?:cannot|unable to) work|(?:eligible for|award|approve) benefits/i,
    );
  }

  const added = service.enqueueProposalGenerationResult(result);
  expect(added).toHaveLength(result.proposals.length);
  expect(service.getCase()).toEqual(before.caseSummary);
  expect(service.getAcceptedStatements()).toEqual(before.acceptedStatements);
  expect(service.getTimeline()).toEqual(before.timeline);
  expect(service.getOutput("ssa_disability_intake")).toEqual(before.ssaOutput);
  expect(service.getOutput("neurology_background")).toEqual(
    before.neurologyOutput,
  );
  expect(service.listProposals()).toHaveLength(
    before.proposalCount + result.proposals.length,
  );

  console.log(
    JSON.stringify({
      run: result.run,
      proposals: result.proposals.map((proposal) => ({
        id: proposal.id,
        statement: proposal.statement,
        supportingExcerpts: proposal.supportingExcerpts,
        uncertainty: proposal.uncertainty,
        authorityLabel: proposal.authorityLabel,
      })),
      authorityStateUnchanged: true,
    }),
  );
});
