import type {
  AcceptedStatement,
  ActivityEvent,
  DemoSnapshot,
  GeneratedOutput,
  Proposal,
  ProposalGenerationRun,
  ReviewDecision,
  ReviewedProposal,
  TimelineEvent,
} from "@/domain/contracts";
import { MAYA_CASE } from "@/fixtures/maya/case";
import { MAYA_PROPOSALS } from "@/fixtures/maya/proposals";
import { MAYA_SOURCES } from "@/fixtures/maya/sources";

export type DemoState = DemoSnapshot;

export type DemoAction =
  | {
      type: "review_proposal";
      proposal: Proposal;
      decision: ReviewDecision;
      selectedEditOptionId?: string;
      acceptedText?: string;
    }
  | {
      type: "generate_output";
      output: GeneratedOutput;
    }
  | {
      type: "enqueue_proposal_generation_result";
      proposals: readonly Proposal[];
      run: ProposalGenerationRun;
    }
  | {
      type: "record_proposal_generation_run";
      run: ProposalGenerationRun;
    }
  | { type: "reset_demo" };

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

const IMMUTABLE_INITIAL_STATE = deepFreeze<DemoState>({
  caseSummary: { ...MAYA_CASE },
  sources: structuredClone(MAYA_SOURCES),
  proposals: structuredClone(MAYA_PROPOSALS),
  reviews: [],
  acceptedStatements: [],
  timeline: [],
  outputs: [],
  activity: [],
  proposalGenerationRuns: [],
});

export function createInitialDemoState(): DemoState {
  return structuredClone(IMMUTABLE_INITIAL_STATE);
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "reset_demo") {
    return createInitialDemoState();
  }

  if (action.type === "generate_output") {
    const revision = action.output.version.generatedAtRevision;
    const activity: ActivityEvent = {
      id: `ACT-${revision}`,
      revision,
      type: "output_generated",
      subjectId: action.output.id,
      detail: `Generated ${action.output.kind} version ${action.output.version.version}.`,
    };
    return {
      ...state,
      caseSummary: {
        ...state.caseSummary,
        lane: "output_review",
        stateRevision: revision,
      },
      outputs: [...state.outputs, action.output],
      activity: [...state.activity, activity],
    };
  }

  if (action.type === "record_proposal_generation_run") {
    const exists = state.proposalGenerationRuns.some(
      (run) => run.idempotencyKey === action.run.idempotencyKey,
    );
    return exists
      ? state
      : {
          ...state,
          proposalGenerationRuns: [...state.proposalGenerationRuns, action.run],
        };
  }

  if (action.type === "enqueue_proposal_generation_result") {
    const existingIds = new Set(state.proposals.map((proposal) => proposal.id));
    const additions = action.proposals.filter(
      (proposal) => !existingIds.has(proposal.id),
    );
    const runExists = state.proposalGenerationRuns.some(
      (run) => run.idempotencyKey === action.run.idempotencyKey,
    );
    return additions.length || !runExists
      ? {
          ...state,
          proposals: [...state.proposals, ...additions],
          proposalGenerationRuns: runExists
            ? state.proposalGenerationRuns
            : [...state.proposalGenerationRuns, action.run],
        }
      : state;
  }

  const revision = state.caseSummary.stateRevision + 1;
  const acceptedStatementId =
    action.decision === "accept" || action.decision === "edit"
      ? `A-${action.proposal.id}`
      : undefined;
  const review: ReviewedProposal = {
    proposalId: action.proposal.id,
    decision: action.decision,
    revision,
    ...(action.selectedEditOptionId
      ? { selectedEditOptionId: action.selectedEditOptionId }
      : {}),
    ...(acceptedStatementId ? { acceptedStatementId } : {}),
  };
  const acceptedStatement: AcceptedStatement | null = acceptedStatementId
    ? {
        id: acceptedStatementId,
        proposalId: action.proposal.id,
        text: action.acceptedText ?? action.proposal.statement,
        origin: action.proposal.origin,
        uncertainty: action.proposal.uncertainty,
        sourceIds: action.proposal.sourceIds,
        authorityLabel: action.proposal.authorityLabel,
        outputSections: action.proposal.outputSections,
        eligibleOutputs: action.proposal.eligibleOutputs,
        acceptedAtRevision: revision,
        edited: action.decision === "edit",
      }
    : null;
  const timelineEvent: TimelineEvent | null =
    acceptedStatement && action.proposal.timelineCandidate
      ? {
          id: `T-${action.proposal.id}`,
          acceptedStatementId: acceptedStatement.id,
          date: action.proposal.timelineCandidate.date,
          label: action.proposal.timelineCandidate.label,
          sourceIds: action.proposal.sourceIds,
        }
      : null;
  const activity: ActivityEvent = {
    id: `ACT-${revision}`,
    revision,
    type: "proposal_reviewed",
    subjectId: action.proposal.id,
    detail: `Proposal ${action.proposal.id} was ${action.decision}.`,
  };

  return {
    ...state,
    caseSummary: {
      ...state.caseSummary,
      lane:
        acceptedStatement || state.acceptedStatements.length > 0
          ? "accepted_case"
          : "proposal_review",
      stateRevision: revision,
    },
    reviews: [...state.reviews, review],
    acceptedStatements: acceptedStatement
      ? [...state.acceptedStatements, acceptedStatement]
      : state.acceptedStatements,
    timeline: timelineEvent ? [...state.timeline, timelineEvent] : state.timeline,
    activity: [...state.activity, activity],
  };
}
