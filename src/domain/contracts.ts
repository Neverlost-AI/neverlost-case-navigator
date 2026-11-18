export type CaseLane =
  | "source_review"
  | "proposal_review"
  | "accepted_case"
  | "output_review";

export type SourceScope =
  | "medical_record"
  | "referral_record"
  | "client_statement"
  | "employer_statement";

export type ProposalOrigin =
  | "source_derived"
  | "client_reported"
  | "missing_evidence"
  | "review_prompt"
  | "ai_generated";

export type UncertaintyLabel =
  | "supported"
  | "unsupported"
  | "client_reported"
  | "missing_evidence"
  | "needs_professional_review";

export type ReviewDecision = "accept" | "edit" | "reject" | "hold";

export type OutputKind = "ssa_disability_intake" | "neurology_background";

export type OutputSection =
  | "medical"
  | "functional"
  | "employer"
  | "referral"
  | "missing_evidence"
  | "pcp_review";

export interface CaseSummary {
  id: "NL-BFG-001";
  clientName: "Maya Bennett";
  primaryObjective: "Prepare an SSA Disability Intake Packet — Synthetic Draft";
  secondaryOutput: "Neurology Referral Background Packet — Synthetic Draft";
  lane: CaseLane;
  stateRevision: number;
  sourceCount: 6;
  synthetic: true;
}

export interface SourceRecord {
  id: `S0${1 | 2 | 3 | 4 | 5 | 6}`;
  title: string;
  scope: SourceScope;
  authorityLabel: string;
  recordDate: string;
  excerpts: readonly string[];
  synthetic: true;
}

export interface BoundedEditOption {
  id: string;
  label: string;
  correctedStatement: string;
}

export interface TimelineCandidate {
  date: string;
  label: string;
}

export interface Proposal {
  id: string;
  statement: string;
  origin: ProposalOrigin;
  uncertainty: UncertaintyLabel;
  sourceIds: readonly SourceRecord["id"][];
  supportingExcerpts: readonly string[];
  authorityLabel: string;
  outputSections: readonly OutputSection[];
  eligibleOutputs: readonly OutputKind[];
  timelineCandidate?: TimelineCandidate;
  boundedEdits: readonly BoundedEditOption[];
  generation?: {
    kind: "openai";
    model: "gpt-5.6-terra";
    label: "AI-generated proposal for human review";
    runId: string;
  };
}

export interface AiProposalCandidate {
  statement: string;
  sourceId: SourceRecord["id"];
  supportingExcerpt: string;
  uncertainty: UncertaintyLabel;
  outputSections: readonly OutputSection[];
  eligibleOutputs: readonly OutputKind[];
  timelineCandidate?: TimelineCandidate;
  generatedByModel: "gpt-5.6-terra";
}

export type ProposalGenerationProvider = "deterministic" | "openai";
export type ProposalGenerationStatus = "completed" | "failed" | "superseded";

export interface ProposalGenerationRun {
  localRunId: string;
  provider: ProposalGenerationProvider;
  model: string;
  providerResponseId: string | null;
  schemaVersion: string;
  instructionVersion: string;
  sourceIds: readonly SourceRecord["id"][];
  sourceSetFingerprint: string;
  startedAt: string;
  completedAt: string;
  validationResult: "passed" | "failed";
  candidateIds: readonly string[];
  deterministicResultHash: string;
  idempotencyKey: string;
  status: ProposalGenerationStatus;
}

export interface ProposalGenerationResult {
  run: ProposalGenerationRun;
  proposals: readonly Proposal[];
}

export interface ReviewProposalInput {
  decision: ReviewDecision;
  editOptionId?: string;
}

export interface ReviewedProposal {
  proposalId: string;
  decision: ReviewDecision;
  revision: number;
  selectedEditOptionId?: string;
  acceptedStatementId?: string;
}

export interface AcceptedStatement {
  id: string;
  proposalId: string;
  text: string;
  origin: ProposalOrigin;
  uncertainty: UncertaintyLabel;
  sourceIds: readonly SourceRecord["id"][];
  authorityLabel: string;
  outputSections: readonly OutputSection[];
  eligibleOutputs: readonly OutputKind[];
  acceptedAtRevision: number;
  edited: boolean;
}

export interface TimelineEvent {
  id: string;
  acceptedStatementId: string;
  date: string;
  label: string;
  sourceIds: readonly SourceRecord["id"][];
}

export interface OutputStatementData {
  acceptedStatementId: string;
  text: string;
  authorityLabel: string;
  uncertainty: UncertaintyLabel;
  sourceIds: readonly SourceRecord["id"][];
}

export interface OutputSectionData {
  id: OutputSection;
  title: string;
  statements: readonly OutputStatementData[];
}

export interface OutputVersion {
  version: number;
  generatedAtRevision: number;
  deterministicLabel: string;
}

export interface GeneratedOutput {
  id: string;
  kind: OutputKind;
  title: string;
  syntheticDraft: true;
  nonprofessionalAdviceNotice: string;
  version: OutputVersion;
  sections: readonly OutputSectionData[];
  html: string;
}

export interface AiPacketParagraph {
  text: string;
  acceptedStatementIds: readonly string[];
}

export interface AiPacketSection {
  id: OutputSection;
  title: string;
  paragraphs: readonly AiPacketParagraph[];
}

export interface AiPacketDraft {
  title: "OpenAI-assisted Disability Case Packet — Synthetic Draft";
  syntheticDraft: true;
  aiGenerated: true;
  model: "gpt-5.6-terra";
  nonprofessionalAdviceNotice: string;
  sections: readonly AiPacketSection[];
  unresolvedEvidence: readonly AiPacketParagraph[];
}

export interface ProvenanceTrace {
  acceptedStatement: AcceptedStatement | null;
  originalProposal: Proposal;
  humanDecision: ReviewedProposal | null;
  supportingSourceIds: readonly SourceRecord["id"][];
  supportingExcerpts: readonly string[];
  authorityLabel: string;
  timelineAppearance: TimelineEvent | null;
  outputAppearances: readonly {
    outputId: string;
    kind: OutputKind;
    sectionIds: readonly OutputSection[];
  }[];
}

export interface ActivityEvent {
  id: string;
  revision: number;
  type: "proposal_reviewed" | "output_generated";
  subjectId: string;
  detail: string;
}

export interface DemoSnapshot {
  caseSummary: CaseSummary;
  sources: readonly SourceRecord[];
  proposals: readonly Proposal[];
  reviews: readonly ReviewedProposal[];
  acceptedStatements: readonly AcceptedStatement[];
  timeline: readonly TimelineEvent[];
  outputs: readonly GeneratedOutput[];
  activity: readonly ActivityEvent[];
  proposalGenerationRuns: readonly ProposalGenerationRun[];
}

export interface CaseNavigatorService {
  getCase(): CaseSummary;
  listSources(): readonly SourceRecord[];
  getSource(sourceId: SourceRecord["id"]): SourceRecord;
  createProposals(): readonly Proposal[];
  listProposals(): readonly Proposal[];
  enqueueProposalGenerationResult(result: ProposalGenerationResult): readonly Proposal[];
  recordSupersededProposalGenerationRun(run: ProposalGenerationRun): void;
  listProposalGenerationRuns(): readonly ProposalGenerationRun[];
  reviewProposal(proposalId: string, input: ReviewProposalInput): ReviewedProposal;
  getAcceptedStatements(): readonly AcceptedStatement[];
  getTimeline(): readonly TimelineEvent[];
  generateOutput(kind: OutputKind): GeneratedOutput;
  getOutput(kind: OutputKind): GeneratedOutput | null;
  traceStatement(statementOrProposalId: string): ProvenanceTrace;
  resetDemo(): DemoSnapshot;
}
