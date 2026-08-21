import { describe, expect, it, vi } from "vitest";
import type { ProposalGenerationResult } from "@/domain/contracts";
import { InMemoryCaseNavigatorService } from "@/services/in-memory-case-navigator";
import { createInitialDemoState, demoReducer } from "@/state/demo-reducer";

function newService() {
  return new InMemoryCaseNavigatorService();
}

function generatedResult(): ProposalGenerationResult {
  const proposalId = "AI-S02-testhash-01";
  return {
    run: {
      localRunId: "proposal-run-test",
      provider: "openai",
      model: "gpt-5.6-terra",
      providerResponseId: "resp_test",
      schemaVersion: "neverlost-proposal-v1",
      instructionVersion: "source-extraction-v1",
      sourceIds: ["S02"],
      sourceSetFingerprint: "fnv1a32:source",
      startedAt: "2026-08-20T00:00:00.000Z",
      completedAt: "2026-08-20T00:00:01.000Z",
      validationResult: "passed",
      candidateIds: [proposalId],
      deterministicResultHash: "fnv1a32:testhash",
      idempotencyKey: "proposal-run-test:S02",
      status: "completed",
    },
    proposals: [
      {
        id: proposalId,
        statement: "Cardiology documented findings consistent with POTS.",
        origin: "ai_generated",
        sourceIds: ["S02"],
        supportingExcerpts: [
          "Orthostatic measurements and the clinical assessment document findings consistent with POTS.",
        ],
        uncertainty: "supported",
        authorityLabel: "Synthetic cardiology record",
        outputSections: ["medical"],
        eligibleOutputs: ["ssa_disability_intake", "neurology_background"],
        timelineCandidate: {
          date: "2024-02-14",
          label: "Cardiology evaluation documented findings consistent with POTS.",
        },
        boundedEdits: [],
        generation: {
          kind: "openai",
          model: "gpt-5.6-terra",
          label: "AI-generated proposal for human review",
          runId: "proposal-run-test",
        },
      },
    ],
  };
}

describe("InMemoryCaseNavigatorService", () => {
  it("enqueues AI proposals without changing accepted case state or revision", () => {
    const service = newService();
    const before = service.resetDemo();

    const result = generatedResult();
    const added = service.enqueueProposalGenerationResult(result);

    expect(added).toEqual([
      expect.objectContaining({
        id: "AI-S02-testhash-01",
        origin: "ai_generated",
        generation: expect.objectContaining({ kind: "openai" }),
      }),
    ]);
    expect(service.getCase()).toEqual(before.caseSummary);
    expect(service.getAcceptedStatements()).toEqual([]);
    expect(service.getTimeline()).toEqual([]);
    expect(service.getOutput("ssa_disability_intake")).toBeNull();
    expect(service.listProposalGenerationRuns()).toEqual([result.run]);

    expect(service.enqueueProposalGenerationResult(result)).toEqual(added);
    expect(service.listProposals().filter((proposal) => proposal.id === added[0].id)).toHaveLength(1);
    expect(service.listProposalGenerationRuns()).toHaveLength(1);
    const conflictingResult = structuredClone(result);
    conflictingResult.run.deterministicResultHash = "fnv1a32:different";
    expect(() =>
      service.enqueueProposalGenerationResult(conflictingResult),
    ).toThrow("Idempotency key was reused");

    service.reviewProposal("AI-S02-testhash-01", { decision: "accept" });
    expect(service.getCase().stateRevision).toBe(1);
    expect(service.getAcceptedStatements()[0]).toMatchObject({
      proposalId: "AI-S02-testhash-01",
      origin: "ai_generated",
    });
  });

  it("lets generation change only proposals and run metadata", () => {
    const before = createInitialDemoState();
    const result = generatedResult();
    const after = demoReducer(before, {
      type: "enqueue_proposal_generation_result",
      proposals: result.proposals,
      run: result.run,
    });

    expect(after.caseSummary).toEqual(before.caseSummary);
    expect(after.reviews).toEqual(before.reviews);
    expect(after.acceptedStatements).toEqual(before.acceptedStatements);
    expect(after.timeline).toEqual(before.timeline);
    expect(after.outputs).toEqual(before.outputs);
    expect(after.activity).toEqual(before.activity);
    expect(after.proposals).toHaveLength(before.proposals.length + 1);
    expect(after.proposalGenerationRuns).toEqual([result.run]);
  });

  it("starts with exactly the six locked synthetic sources", () => {
    const sources = newService().listSources();

    expect(sources).toHaveLength(6);
    expect(sources.map((source) => source.id)).toEqual([
      "S01",
      "S02",
      "S03",
      "S04",
      "S05",
      "S06",
    ]);
    expect(sources.map((source) => source.title)).toEqual([
      "Connective-Tissue Specialist Assessment",
      "Cardiology and Orthostatic Evaluation",
      "Primary-Care Establishment Note",
      "Prior Physical-Therapy Referral",
      "Client Functional and Work History Statement",
      "Former Employer Attendance and Accommodation Summary",
    ]);
  });

  it("generates the same proposals on every call and instance", () => {
    const first = newService();
    const second = newService();

    expect(first.createProposals()).toEqual(first.createProposals());
    expect(first.createProposals()).toEqual(second.createProposals());
    expect(first.getCase().stateRevision).toBe(0);
  });

  it("accepts a proposal into accepted case state", () => {
    const service = newService();

    const review = service.reviewProposal("P01", { decision: "accept" });

    expect(review).toMatchObject({
      proposalId: "P01",
      decision: "accept",
      acceptedStatementId: "A-P01",
    });
    expect(service.getAcceptedStatements()).toEqual([
      expect.objectContaining({
        id: "A-P01",
        text: "Cardiology documented findings consistent with POTS.",
      }),
    ]);
  });

  it("rejects the unsupported testing proposal without changing accepted state", () => {
    const service = newService();
    const beforeStatements = service.getAcceptedStatements();
    const beforeTimeline = service.getTimeline();

    const review = service.reviewProposal("P02", { decision: "reject" });

    expect(review.decision).toBe("reject");
    expect(service.getAcceptedStatements()).toEqual(beforeStatements);
    expect(service.getTimeline()).toEqual(beforeTimeline);
    expect(service.traceStatement("P02").supportingExcerpts).toContain(
      "Comprehensive autonomic testing has not yet been completed.",
    );
  });

  it("holds a proposal without changing accepted state", () => {
    const service = newService();
    const beforeStatements = service.getAcceptedStatements();
    const beforeTimeline = service.getTimeline();

    const review = service.reviewProposal("P03", { decision: "hold" });

    expect(review.decision).toBe("hold");
    expect(service.getAcceptedStatements()).toEqual(beforeStatements);
    expect(service.getTimeline()).toEqual(beforeTimeline);
    expect(service.listProposals().find((proposal) => proposal.id === "P03")).toBeDefined();
  });

  it("uses only a bounded edit while preserving the original proposal", () => {
    const service = newService();
    const original = service.listProposals().find((proposal) => proposal.id === "P03");

    service.reviewProposal("P03", {
      decision: "edit",
      editOptionId: "P03-E01",
    });

    expect(service.listProposals().find((proposal) => proposal.id === "P03")).toEqual(
      original,
    );
    const acceptedStatement = service.getAcceptedStatements()[0];
    expect(acceptedStatement).toMatchObject({
      proposalId: "P03",
      edited: true,
      origin: "client_reported",
      uncertainty: "client_reported",
      authorityLabel: "Client-reported synthetic statement",
      text: "Maya reports that she can sometimes use a computer for approximately 30 to 45 minutes before symptoms increase, but she cannot necessarily repeat that activity throughout a full day.",
    });
    expect(original?.supportingExcerpts[0]).toContain(
      "approximately 30 to 45 minutes",
    );
    expect(acceptedStatement?.text).toContain("approximately 30 to 45 minutes");
    expect(acceptedStatement?.text).not.toContain("60 minutes");
    expect(() =>
      newService().reviewProposal("P03", {
        decision: "edit",
        editOptionId: "unrestricted-text-is-not-supported",
      }),
    ).toThrow("Unknown bounded edit");
  });

  it("adds accepted event-eligible information to the timeline", () => {
    const service = newService();

    service.reviewProposal("P01", { decision: "accept" });

    expect(service.getTimeline()).toEqual([
      expect.objectContaining({
        id: "T-P01",
        acceptedStatementId: "A-P01",
        date: "2024-02-14",
        sourceIds: ["S02"],
      }),
    ]);
  });

  it("projects accepted POTS information into both outputs and excludes rejected testing", () => {
    const service = newService();
    service.reviewProposal("P01", { decision: "accept" });
    service.reviewProposal("P02", { decision: "reject" });

    const ssa = service.generateOutput("ssa_disability_intake");
    const neurology = service.generateOutput("neurology_background");

    for (const output of [ssa, neurology]) {
      expect(output.html).toContain("Cardiology documented findings consistent with POTS.");
      expect(output.html).not.toContain(
        "Formal autonomic testing confirmed severe dysautonomia.",
      );
      expect(output.html).toContain("SYNTHETIC DRAFT");
      expect(output.html).toContain("not medical, legal, or other professional advice");
    }
  });

  it("keeps detailed employer evidence out of neurology output", () => {
    const service = newService();
    service.reviewProposal("P04", { decision: "accept" });

    const ssa = service.generateOutput("ssa_disability_intake");
    const neurology = service.generateOutput("neurology_background");

    expect(ssa.html).toContain("former employer reported");
    expect(neurology.html).not.toContain("former employer reported");
  });

  it("builds every required SSA section from accepted information with visible labels", () => {
    const service = newService();
    for (const proposalId of ["P01", "P03", "P04", "P05", "P06", "P07"]) {
      service.reviewProposal(proposalId, { decision: "accept" });
    }

    const output = service.generateOutput("ssa_disability_intake");

    expect(output.sections.map((section) => section.id)).toEqual([
      "medical",
      "functional",
      "employer",
      "referral",
      "missing_evidence",
      "pcp_review",
    ]);
    expect(output.html).toContain("Client-reported synthetic statement");
    expect(output.html).toContain("client_reported");
    expect(output.html).toContain("Synthetic cardiology record (S02)");
  });

  it("traces an accepted statement through its proposal, source, timeline, and outputs", () => {
    const service = newService();
    service.reviewProposal("P01", { decision: "accept" });
    service.generateOutput("ssa_disability_intake");
    service.generateOutput("neurology_background");

    const trace = service.traceStatement("A-P01");

    expect(trace.acceptedStatement?.text).toBe(
      "Cardiology documented findings consistent with POTS.",
    );
    expect(trace.originalProposal.id).toBe("P01");
    expect(trace.humanDecision?.decision).toBe("accept");
    expect(trace.supportingSourceIds).toEqual(["S02"]);
    expect(trace.supportingExcerpts[0]).toContain("consistent with POTS");
    expect(trace.authorityLabel).toBe("Synthetic cardiology record");
    expect(trace.timelineAppearance?.id).toBe("T-P01");
    expect(trace.outputAppearances.map((appearance) => appearance.kind)).toEqual([
      "ssa_disability_intake",
      "neurology_background",
    ]);
  });

  it("gives a rejected proposal no timeline or output appearances", () => {
    const service = newService();
    service.reviewProposal("P02", { decision: "reject" });
    service.generateOutput("ssa_disability_intake");
    service.generateOutput("neurology_background");

    const trace = service.traceStatement("P02");

    expect(trace.acceptedStatement).toBeNull();
    expect(trace.humanDecision?.decision).toBe("reject");
    expect(trace.timelineAppearance).toBeNull();
    expect(trace.outputAppearances).toEqual([]);
  });

  it("increments revision only for meaningful review and output actions", () => {
    const service = newService();
    service.getCase();
    service.listSources();
    service.createProposals();
    service.listProposals();
    expect(service.getCase().stateRevision).toBe(0);

    service.reviewProposal("P03", { decision: "hold" });
    expect(service.getCase().stateRevision).toBe(1);

    service.generateOutput("ssa_disability_intake");
    expect(service.getCase().stateRevision).toBe(2);
  });

  it("restores an exact deep-equivalent initial state on reset", () => {
    const untouched = newService().resetDemo();
    const service = newService();
    service.reviewProposal("P01", { decision: "accept" });
    service.reviewProposal("P02", { decision: "reject" });
    service.generateOutput("ssa_disability_intake");

    const reset = service.resetDemo();

    expect(reset).toEqual(untouched);
    expect(reset).not.toBe(untouched);
    expect(reset.sources).not.toBe(untouched.sources);
  });

  it("uses no network calls or persistence shared between service instances", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("Network access is forbidden");
    });
    vi.stubGlobal("fetch", fetchSpy);
    const first = newService();
    const second = newService();

    first.getCase();
    first.listSources();
    first.getSource("S02");
    first.createProposals();
    first.listProposals();
    first.reviewProposal("P01", { decision: "accept" });
    first.getAcceptedStatements();
    first.getTimeline();
    first.generateOutput("ssa_disability_intake");
    first.getOutput("ssa_disability_intake");
    first.traceStatement("A-P01");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(second.getCase().stateRevision).toBe(0);
    expect(second.getAcceptedStatements()).toEqual([]);
    expect(second.getOutput("ssa_disability_intake")).toBeNull();
    vi.unstubAllGlobals();
  });
});
