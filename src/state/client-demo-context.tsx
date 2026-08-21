"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AcceptedStatement,
  CaseSummary,
  GeneratedOutput,
  OutputKind,
  Proposal,
  ProposalGenerationResult,
  ProvenanceTrace,
  ReviewProposalInput,
  ReviewedProposal,
  SourceRecord,
  TimelineEvent,
} from "@/domain/contracts";
import { InMemoryCaseNavigatorService } from "@/services/in-memory-case-navigator";
import { ProposalRunSequencer } from "@/services/proposal-run-sequencer";

interface DemoContextValue {
  caseSummary: CaseSummary;
  sources: readonly SourceRecord[];
  proposals: readonly Proposal[];
  reviews: readonly ReviewedProposal[];
  acceptedStatements: readonly AcceptedStatement[];
  timeline: readonly TimelineEvent[];
  outputs: Readonly<Partial<Record<OutputKind, GeneratedOutput>>>;
  isBusy: boolean;
  error: string | null;
  announcement: string;
  resetVersion: number;
  reviewProposal(proposalId: string, input: ReviewProposalInput): Promise<void>;
  analyzeSource(sourceId: SourceRecord["id"]): Promise<readonly Proposal[]>;
  generateOutputs(): Promise<void>;
  resetDemo(): Promise<void>;
  traceStatement(statementOrProposalId: string): ProvenanceTrace | null;
  clearError(): void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The synthetic case could not be updated. Please try again.";
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "The optional OpenAI request failed.");
  }
  return body;
}

export function ClientDemoProvider({ children }: Readonly<{ children: ReactNode }>) {
  const serviceRef = useRef<InMemoryCaseNavigatorService | null>(null);
  if (serviceRef.current === null) {
    serviceRef.current = new InMemoryCaseNavigatorService();
  }
  const service = serviceRef.current;

  const [caseSummary, setCaseSummary] = useState(() => service.getCase());
  const [sources] = useState(() => service.listSources());
  const [proposals, setProposals] = useState(() => service.listProposals());
  const [reviews, setReviews] = useState<readonly ReviewedProposal[]>([]);
  const [acceptedStatements, setAcceptedStatements] = useState<
    readonly AcceptedStatement[]
  >([]);
  const [timeline, setTimeline] = useState<readonly TimelineEvent[]>([]);
  const [outputs, setOutputs] = useState<
    Readonly<Partial<Record<OutputKind, GeneratedOutput>>>
  >({});
  const proposalRunSequencerRef = useRef(new ProposalRunSequencer());
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState(
    "Maya’s deterministic synthetic case is ready for review.",
  );
  const [resetVersion, setResetVersion] = useState(0);

  const refreshAcceptedCase = useCallback(() => {
    setCaseSummary(service.getCase());
    setAcceptedStatements(service.getAcceptedStatements());
    setTimeline(service.getTimeline());
    setOutputs({
      ...(service.getOutput("ssa_disability_intake")
        ? { ssa_disability_intake: service.getOutput("ssa_disability_intake")! }
        : {}),
      ...(service.getOutput("neurology_background")
        ? { neurology_background: service.getOutput("neurology_background")! }
        : {}),
    });
  }, [service]);

  const generateBothOutputs = useCallback(() => {
    const ssa = service.generateOutput("ssa_disability_intake");
    const neurology = service.generateOutput("neurology_background");
    setOutputs({
      ssa_disability_intake: ssa,
      neurology_background: neurology,
    });
  }, [service]);

  const reviewProposal = useCallback(
    async (proposalId: string, input: ReviewProposalInput) => {
      setIsBusy(true);
      setError(null);
      await Promise.resolve();
      try {
        const review = service.reviewProposal(proposalId, input);
        setReviews((current) => [...current, review]);
        if (outputs.ssa_disability_intake || outputs.neurology_background) {
          generateBothOutputs();
        }
        refreshAcceptedCase();
        setAnnouncement(
          `Proposal ${proposalId} was ${input.decision}. Accepted case state is updated.`,
        );
      } catch (caught) {
        setError(errorMessage(caught));
      } finally {
        setIsBusy(false);
      }
    }, [generateBothOutputs, outputs, refreshAcceptedCase, service],
  );

  const analyzeSource = useCallback(
    async (sourceId: SourceRecord["id"]): Promise<readonly Proposal[]> => {
      const runToken = proposalRunSequencerRef.current.begin(sourceId);
      setIsBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/ai/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceIds: [sourceId],
            localRunId: runToken.localRunId,
            idempotencyKey: runToken.idempotencyKey,
          }),
        });
        const result = await responseJson<ProposalGenerationResult>(response);
        if (!proposalRunSequencerRef.current.isLatest(runToken)) {
          service.recordSupersededProposalGenerationRun(result.run);
          setAnnouncement(
            `${result.run.localRunId} completed after a newer analysis and was not added to review.`,
          );
          return [];
        }
        const added = service.enqueueProposalGenerationResult(result);
        setProposals(service.listProposals());
        setAnnouncement(
          `${added.length} AI-generated proposal${added.length === 1 ? "" : "s"} entered human review as unreviewed. Accepted case state was not changed.`,
        );
        return added;
      } catch (caught) {
        setError(errorMessage(caught));
        return [];
      } finally {
        setIsBusy(false);
      }
    },
    [service],
  );

  const generateOutputs = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    await Promise.resolve();
    try {
      generateBothOutputs();
      setCaseSummary(service.getCase());
      setAnnouncement(
        "Both synthetic packet previews were generated from accepted case state.",
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }, [generateBothOutputs, service]);

  const resetDemo = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    await Promise.resolve();
    try {
      const initial = service.resetDemo();
      setCaseSummary(initial.caseSummary);
      setProposals(initial.proposals);
      setReviews(initial.reviews);
      setAcceptedStatements(initial.acceptedStatements);
      setTimeline(initial.timeline);
      setOutputs({});
      proposalRunSequencerRef.current.reset();
      setResetVersion((version) => version + 1);
      setAnnouncement(
        "Demo reset complete. All proposals are unreviewed and accepted case state is empty.",
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }, [service]);

  const traceStatement = useCallback(
    (statementOrProposalId: string): ProvenanceTrace | null => {
      try {
        return service.traceStatement(statementOrProposalId);
      } catch {
        return null;
      }
    },
    [service],
  );

  const value = useMemo<DemoContextValue>(
    () => ({
      caseSummary,
      sources,
      proposals,
      reviews,
      acceptedStatements,
      timeline,
      outputs,
      isBusy,
      error,
      announcement,
      resetVersion,
      reviewProposal,
      analyzeSource,
      generateOutputs,
      resetDemo,
      traceStatement,
      clearError: () => setError(null),
    }),
    [
      acceptedStatements,
      analyzeSource,
      announcement,
      caseSummary,
      error,
      generateOutputs,
      isBusy,
      outputs,
      proposals,
      resetDemo,
      resetVersion,
      reviewProposal,
      reviews,
      sources,
      timeline,
      traceStatement,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useCaseNavigator(): DemoContextValue {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useCaseNavigator must be used within ClientDemoProvider.");
  }
  return context;
}
