import type {
  CaseNavigatorService,
  CaseSummary,
  DemoSnapshot,
  GeneratedOutput,
  OutputKind,
  Proposal,
  ProposalGenerationResult,
  ProposalGenerationRun,
  ProvenanceTrace,
  ReviewProposalInput,
  ReviewedProposal,
  SourceRecord,
  AcceptedStatement,
  TimelineEvent,
} from "@/domain/contracts";
import { renderOutput } from "@/outputs/render-output";
import { buildTrace } from "@/provenance/build-trace";
import {
  createInitialDemoState,
  demoReducer,
  type DemoState,
} from "@/state/demo-reducer";

function copy<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryCaseNavigatorService implements CaseNavigatorService {
  private state: DemoState = createInitialDemoState();

  getCase(): CaseSummary {
    return copy(this.state.caseSummary);
  }

  listSources(): readonly SourceRecord[] {
    return copy(this.state.sources);
  }

  getSource(sourceId: SourceRecord["id"]): SourceRecord {
    const source = this.state.sources.find((candidate) => candidate.id === sourceId);
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }
    return copy(source);
  }

  createProposals(): readonly Proposal[] {
    return copy(this.state.proposals);
  }

  listProposals(): readonly Proposal[] {
    return copy(this.state.proposals);
  }

  enqueueProposalGenerationResult(
    result: ProposalGenerationResult,
  ): readonly Proposal[] {
    const existingRun = this.state.proposalGenerationRuns.find(
      (run) => run.idempotencyKey === result.run.idempotencyKey,
    );
    if (existingRun) {
      if (
        existingRun.deterministicResultHash !==
        result.run.deterministicResultHash
      ) {
        throw new Error("Idempotency key was reused for a different proposal result.");
      }
      return copy(
        this.state.proposals.filter((proposal) =>
          existingRun.candidateIds.includes(proposal.id),
        ),
      );
    }
    if (
      result.run.status !== "completed" ||
      result.run.validationResult !== "passed"
    ) {
      throw new Error("Only completed, validated generation runs may be enqueued.");
    }
    if (
      result.run.candidateIds.length !== result.proposals.length ||
      result.proposals.some(
        (proposal, index) => proposal.id !== result.run.candidateIds[index],
      )
    ) {
      throw new Error("Generation run candidate IDs do not match its proposals.");
    }

    for (const proposal of result.proposals) {
      if (proposal.origin !== "ai_generated" || !proposal.generation) {
        throw new Error("Only clearly labeled AI-generated proposals may be enqueued.");
      }
      const sourceId = proposal.sourceIds[0];
      const source = this.state.sources.find((item) => item.id === sourceId);
      if (!source) {
        throw new Error(`Unknown source: ${String(sourceId)}`);
      }
      if (
        proposal.sourceIds.length !== 1 ||
        proposal.supportingExcerpts.length !== 1 ||
        !source.excerpts.includes(proposal.supportingExcerpts[0])
      ) {
        throw new Error(
          `AI proposal excerpt is not preserved in ${source.id}.`,
        );
      }
    }

    this.state = demoReducer(this.state, {
      type: "enqueue_proposal_generation_result",
      proposals: result.proposals,
      run: result.run,
    });
    return copy(result.proposals);
  }

  recordSupersededProposalGenerationRun(run: ProposalGenerationRun): void {
    this.state = demoReducer(this.state, {
      type: "record_proposal_generation_run",
      run: { ...run, status: "superseded" },
    });
  }

  listProposalGenerationRuns(): readonly ProposalGenerationRun[] {
    return copy(this.state.proposalGenerationRuns);
  }

  reviewProposal(
    proposalId: string,
    input: ReviewProposalInput,
  ): ReviewedProposal {
    const proposal = this.state.proposals.find(
      (candidate) => candidate.id === proposalId,
    );
    if (!proposal) {
      throw new Error(`Unknown proposal: ${proposalId}`);
    }
    if (this.state.reviews.some((review) => review.proposalId === proposalId)) {
      throw new Error(`Proposal already reviewed: ${proposalId}`);
    }

    let acceptedText: string | undefined;
    let selectedEditOptionId: string | undefined;
    if (input.decision === "edit") {
      if (!input.editOptionId) {
        throw new Error("A bounded edit option is required for an edit decision.");
      }
      const edit = proposal.boundedEdits.find(
        (option) => option.id === input.editOptionId,
      );
      if (!edit) {
        throw new Error(`Unknown bounded edit for ${proposalId}: ${input.editOptionId}`);
      }
      acceptedText = edit.correctedStatement;
      selectedEditOptionId = edit.id;
    } else if (input.editOptionId) {
      throw new Error("Edit options may only be used with an edit decision.");
    } else if (input.decision === "accept") {
      acceptedText = proposal.statement;
    }

    this.state = demoReducer(this.state, {
      type: "review_proposal",
      proposal,
      decision: input.decision,
      ...(selectedEditOptionId ? { selectedEditOptionId } : {}),
      ...(acceptedText ? { acceptedText } : {}),
    });
    const review = this.state.reviews.find(
      (candidate) => candidate.proposalId === proposalId,
    );
    if (!review) {
      throw new Error(`Review was not recorded: ${proposalId}`);
    }
    return copy(review);
  }

  getAcceptedStatements(): readonly AcceptedStatement[] {
    return copy(this.state.acceptedStatements);
  }

  getTimeline(): readonly TimelineEvent[] {
    return copy(this.state.timeline);
  }

  generateOutput(kind: OutputKind): GeneratedOutput {
    const version =
      this.state.outputs.filter((output) => output.kind === kind).length + 1;
    const revision = this.state.caseSummary.stateRevision + 1;
    const output = renderOutput(
      kind,
      this.state.acceptedStatements,
      version,
      revision,
    );
    this.state = demoReducer(this.state, {
      type: "generate_output",
      output,
    });
    return copy(output);
  }

  getOutput(kind: OutputKind): GeneratedOutput | null {
    const output = [...this.state.outputs]
      .reverse()
      .find((candidate) => candidate.kind === kind);
    return output ? copy(output) : null;
  }

  traceStatement(statementOrProposalId: string): ProvenanceTrace {
    return copy(buildTrace(this.state, statementOrProposalId));
  }

  resetDemo(): DemoSnapshot {
    this.state = demoReducer(this.state, { type: "reset_demo" });
    return copy(this.state);
  }
}
