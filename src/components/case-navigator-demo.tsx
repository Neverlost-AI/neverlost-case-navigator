"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type {
  GeneratedOutput,
  ReviewDecision,
  ReviewedProposal,
  SourceRecord,
  SourceScope,
} from "@/domain/contracts";
import {
  ClientDemoProvider,
  useCaseNavigator,
} from "@/state/client-demo-context";

const DECISION_LABELS: Record<ReviewDecision, string> = {
  accept: "Accepted",
  edit: "Accepted with bounded edit",
  reject: "Rejected",
  hold: "Held",
};

const SCOPE_LABELS: Record<SourceScope, string> = {
  medical_record: "Medical record",
  referral_record: "Referral record",
  client_statement: "Client statement",
  employer_statement: "Employer statement",
};

const SCOPE_LIMITS: Record<SourceScope, string> = {
  medical_record:
    "This synthetic record does not establish facts beyond its quoted findings or replace professional review.",
  referral_record:
    "A referral request does not establish that treatment occurred or produced a particular outcome.",
  client_statement:
    "Client-reported experience is not an independent medical, vocational, or eligibility determination.",
  employer_statement:
    "Employer-reported observations are not a medical diagnosis or benefits determination.",
};

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function reviewFor(
  reviews: readonly ReviewedProposal[],
  proposalId: string,
): ReviewedProposal | undefined {
  return reviews.find((review) => review.proposalId === proposalId);
}

function StatusBadge({ children, tone = "neutral" }: Readonly<{
  children: React.ReactNode;
  tone?: "neutral" | "accepted" | "rejected" | "held" | "pending" | "warning";
}>) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

function OpeningHook({ overviewRef }: Readonly<{
  overviewRef: RefObject<HTMLElement | null>;
}>) {
  const { sources } = useCaseNavigator();

  return (
    <header className="hero" aria-labelledby="page-title">
      <nav className="topbar" aria-label="Case navigator sections">
        <a className="wordmark" href="#top" aria-label="Neverlost Case Navigator home">
          <Image
            className="wordmark-logo"
            src="/brand/nvlt-youtube-logo.png"
            alt="Neverlost NVLT logo — Governed, Testable, Bounded."
            width={760}
            height={777}
            priority
            unoptimized
          />
          <span className="wordmark-label">Neverlost Case Navigator</span>
        </a>
        <div className="topbar-links">
          <a href="#sources">Sources</a>
          <a href="#proposal-review">Review</a>
          <a href="#outputs">Packets</a>
        </div>
      </nav>
      <div className="hero-grid" id="top">
        <div className="hero-copy">
          <p className="eyebrow">A human-reviewed case foundation</p>
          <h1 id="page-title">
            Maya has one life, but her story is scattered across six records.
          </h1>
          <h2 className="sr-only">Neverlost Case Navigator</h2>
          <p className="hero-lede">
            Neverlost turns fragmented records into one human-reviewed case
            foundation. AI proposes. A human decides what becomes part of the
            accepted case.
          </p>
          <button
            className="button button-primary button-large"
            type="button"
            onClick={() => overviewRef.current?.focus()}
          >
            Open Maya’s case
            <span aria-hidden="true">→</span>
          </button>
          <p className="boundary-note">
            Synthetic demonstration only · No real client records · No eligibility decision
          </p>
        </div>
        <div className="record-stack" aria-label="Six preserved synthetic records">
          <div className="record-stack-heading">
            <span>Six fragments</span>
            <strong>One review path</strong>
          </div>
          {sources.map((source) => (
            <div className="record-slip" key={source.id}>
              <span>{source.id}</span>
              <p>{source.title}</p>
            </div>
          ))}
          <div className="human-gate">
            <span aria-hidden="true">✓</span>
            <p><strong>Human gate</strong>Nothing enters the accepted case without review.</p>
          </div>
        </div>
      </div>
    </header>
  );
}

function FeedbackBar() {
  const { announcement, clearError, error, isBusy } = useCaseNavigator();
  return (
    <div className="feedback-shell">
      {isBusy ? (
        <div className="feedback feedback-loading" role="status" aria-live="polite">
          <span className="loading-dot" aria-hidden="true" />
          Updating the deterministic case…
        </div>
      ) : (
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      )}
      {error ? (
        <div className="feedback feedback-error" role="alert">
          <span>{error}</span>
          <button type="button" className="text-button" onClick={clearError}>
            Dismiss error
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CaseOverview({ overviewRef }: Readonly<{
  overviewRef: RefObject<HTMLElement | null>;
}>) {
  const {
    acceptedStatements,
    caseSummary,
    outputs,
    proposals,
    reviews,
  } = useCaseNavigator();
  const rejected = reviews.filter((review) => review.decision === "reject").length;
  const held = reviews.filter((review) => review.decision === "hold").length;
  const outputReady = acceptedStatements.length > 0;

  return (
    <section
      className="section overview-section"
      id="case-overview"
      aria-labelledby="case-overview-title"
      ref={overviewRef}
      tabIndex={-1}
    >
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Synthetic case · {caseSummary.id}</p>
          <h2 id="case-overview-title">Maya Bennett</h2>
          <p>{caseSummary.primaryObjective}</p>
        </div>
        <StatusBadge tone="accepted">Synthetic only</StatusBadge>
      </div>

      <div className="metric-grid" aria-label="Case review status">
        <article className="metric-card metric-emphasis">
          <span>Proposal review</span>
          <strong>{reviews.length} / {proposals.length}</strong>
          <progress value={reviews.length} max={proposals.length}>
            {reviews.length} of {proposals.length}
          </progress>
        </article>
        <article className="metric-card">
          <span>Accepted statements</span>
          <strong>{acceptedStatements.length}</strong>
          <small>Human-approved case state</small>
        </article>
        <article className="metric-card">
          <span>Held · Rejected</span>
          <strong>{held} · {rejected}</strong>
          <small>Preserved outside accepted state</small>
        </article>
        <article className="metric-card">
          <span>State revision</span>
          <strong>{caseSummary.stateRevision}</strong>
          <small>{humanize(caseSummary.lane)}</small>
        </article>
      </div>

      <div className="overview-details">
        <div>
          <span className="detail-label">Primary objective</span>
          <p>{caseSummary.primaryObjective}</p>
        </div>
        <div>
          <span className="detail-label">Secondary output</span>
          <p>{caseSummary.secondaryOutput}</p>
        </div>
        <div>
          <span className="detail-label">Preserved evidence</span>
          <p>{caseSummary.sourceCount} synthetic sources · no seventh source</p>
        </div>
        <div>
          <span className="detail-label">Output readiness</span>
          <p>
            {outputs.ssa_disability_intake && outputs.neurology_background
              ? "Both previews generated"
              : outputReady
                ? "Accepted evidence is ready to preview"
                : "Awaiting accepted evidence"}
          </p>
        </div>
      </div>
    </section>
  );
}

function SourceLibrary({ onOpenProposal }: Readonly<{
  onOpenProposal(proposalId: string): void;
}>) {
  const {
    analyzeSource,
    isBusy,
    proposals,
    resetVersion,
    reviews,
    sources,
  } = useCaseNavigator();
  const [selectedId, setSelectedId] = useState<SourceRecord["id"]>("S01");

  useEffect(() => setSelectedId("S01"), [resetVersion]);

  const selected = sources.find((source) => source.id === selectedId) ?? sources[0];
  const related = proposals.filter((proposal) =>
    proposal.sourceIds.includes(selected.id),
  );
  const supported = related.filter((proposal) => proposal.uncertainty !== "unsupported");
  const unsupported = related.filter((proposal) => proposal.uncertainty === "unsupported");

  async function analyzeSelectedSource() {
    const added = await analyzeSource(selected.id);
    if (added[0]) {
      onOpenProposal(added[0].id);
    }
  }

  return (
    <section className="section" id="sources" aria-labelledby="sources-title">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Preserved evidence</p>
          <h2 id="sources-title">Source library</h2>
          <p>Exactly six synthetic records. Select one to inspect its boundaries.</p>
        </div>
        <span className="count-mark" aria-label="Six sources">06</span>
      </div>

      <div className="source-workbench">
        <div className="source-list" aria-label="Synthetic source records">
          {sources.map((source) => {
            const sourceProposals = proposals.filter((proposal) =>
              proposal.sourceIds.includes(source.id),
            );
            const reviewedCount = sourceProposals.filter((proposal) =>
              reviewFor(reviews, proposal.id),
            ).length;
            return (
              <button
                className={`source-row ${selected.id === source.id ? "source-row-selected" : ""}`}
                type="button"
                key={source.id}
                onClick={() => setSelectedId(source.id)}
                aria-pressed={selected.id === source.id}
                aria-label={`View ${source.id}: ${source.title}`}
              >
                <span className="source-id">{source.id}</span>
                <span className="source-row-main">
                  <strong>{source.title}</strong>
                  <small>{source.recordDate} · {SCOPE_LABELS[source.scope]}</small>
                  <span>{source.excerpts[0]}</span>
                </span>
                <span className="source-row-meta">
                  {reviewedCount}/{sourceProposals.length} reviewed
                </span>
              </button>
            );
          })}
        </div>

        <article className="source-detail" aria-labelledby="source-detail-title">
          <header>
            <div>
              <p className="eyebrow">{selected.id} · {selected.recordDate}</p>
              <h3 id="source-detail-title">{selected.title}</h3>
            </div>
            <StatusBadge>{SCOPE_LABELS[selected.scope]}</StatusBadge>
          </header>
          <dl className="metadata-list">
            <div><dt>Authority</dt><dd>{selected.authorityLabel}</dd></div>
            <div><dt>Review status</dt><dd>{related.some((item) => reviewFor(reviews, item.id)) ? "Review in progress" : "Unreviewed"}</dd></div>
            <div><dt>Related proposals</dt><dd>{related.length}</dd></div>
          </dl>
          <div className="related-links" aria-label="Optional OpenAI source analysis">
            <h4>Optional live analysis</h4>
            <p>
              Send only {selected.id} to the server. The server reloads this
              synthetic fixture and returns unreviewed AI-generated proposals.
            </p>
            <button
              type="button"
              className="button button-secondary source-analysis-button"
              disabled={isBusy}
              onClick={analyzeSelectedSource}
            >
              Analyze {selected.id} with OpenAI
            </button>
          </div>
          <div className="document-text">
            <h4>Full synthetic source text</h4>
            {selected.excerpts.map((excerpt) => <p key={excerpt}>{excerpt}</p>)}
          </div>
          <div className="evidence-boundaries">
            <div className="supports-box">
              <h4>What this source supports</h4>
              {supported.length ? (
                <ul>{supported.map((proposal) => <li key={proposal.id}>{proposal.statement}</li>)}</ul>
              ) : <p>No supported proposal is linked.</p>}
            </div>
            <div className="limits-box">
              <h4>What it does not establish</h4>
              {unsupported.length ? (
                <ul>{unsupported.map((proposal) => <li key={proposal.id}>{proposal.statement}</li>)}</ul>
              ) : <p>{SCOPE_LIMITS[selected.scope]}</p>}
            </div>
          </div>
          <div className="related-links">
            <h4>Related proposals</h4>
            {related.map((proposal) => (
              <button type="button" className="text-button" key={proposal.id} onClick={() => onOpenProposal(proposal.id)}>
                {proposal.id} · {humanize(proposal.uncertainty)}
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function DemoPath({ onSelectProposal }: Readonly<{
  onSelectProposal(proposalId: string): void;
}>) {
  const { reviews } = useCaseNavigator();
  const steps = [
    { id: "P01", label: "Accept supported POTS evidence", done: reviewFor(reviews, "P01")?.decision === "accept" },
    { id: "P02", label: "Reject unsupported autonomic claim", done: reviewFor(reviews, "P02")?.decision === "reject" },
    { id: "P03", label: "Apply bounded client-reported edit", done: reviewFor(reviews, "P03")?.decision === "edit" },
    { id: "P06", label: "Hold unresolved evidence", done: reviews.some((review) => review.decision === "hold") },
  ];

  return (
    <aside className="demo-path" aria-labelledby="demo-path-title">
      <div className="demo-path-copy">
        <p className="eyebrow">Judge-ready path</p>
        <h3 id="demo-path-title">Four decisions show the human gate</h3>
      </div>
      <ol>
        {steps.map((step) => (
          <li key={step.id} className={step.done ? "demo-step-done" : ""}>
            <button type="button" onClick={() => onSelectProposal(step.id)}>
              <span aria-hidden="true">{step.done ? "✓" : step.id}</span>
              {step.label}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function ProposalReview({
  selectedProposalId,
  setSelectedProposalId,
  onTrace,
}: Readonly<{
  selectedProposalId: string;
  setSelectedProposalId(proposalId: string): void;
  onTrace(statementOrProposalId: string): void;
}>) {
  const {
    acceptedStatements,
    isBusy,
    proposals,
    resetVersion,
    reviewProposal,
    reviews,
    sources,
  } = useCaseNavigator();
  const proposal = proposals.find((item) => item.id === selectedProposalId) ?? proposals[0];
  const review = reviewFor(reviews, proposal.id);
  const [editOptionId, setEditOptionId] = useState(proposal.boundedEdits[0]?.id ?? "");

  useEffect(() => {
    setSelectedProposalId("P01");
  }, [resetVersion, setSelectedProposalId]);

  useEffect(() => {
    setEditOptionId(proposal.boundedEdits[0]?.id ?? "");
  }, [proposal]);

  const pending = proposals.filter((item) => !reviewFor(reviews, item.id));
  const source = sources.find((item) => item.id === proposal.sourceIds[0]);
  const acceptedStatement = review?.acceptedStatementId
    ? acceptedStatements.find((item) => item.id === review.acceptedStatementId)
    : undefined;

  async function decide(decision: ReviewDecision) {
    await reviewProposal(proposal.id, {
      decision,
      ...(decision === "edit" ? { editOptionId } : {}),
    });
  }

  function movePending(direction: -1 | 1) {
    if (!pending.length) return;
    const current = pending.findIndex((item) => item.id === proposal.id);
    const base = current === -1 ? 0 : current;
    const next = (base + direction + pending.length) % pending.length;
    setSelectedProposalId(pending[next].id);
  }

  return (
    <section className="section review-section" id="proposal-review" aria-labelledby="review-title" tabIndex={-1}>
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">AI proposes · A human decides</p>
          <h2 id="review-title">Proposal review</h2>
          <p>Original proposals remain preserved regardless of the human decision.</p>
        </div>
        <StatusBadge tone={pending.length ? "pending" : "accepted"}>
          {pending.length} pending
        </StatusBadge>
      </div>

      <DemoPath onSelectProposal={setSelectedProposalId} />

      <div className="proposal-workbench">
        <nav className="proposal-index" aria-label="Proposal queue">
          {proposals.map((item) => {
            const itemReview = reviewFor(reviews, item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={item.id === proposal.id ? "proposal-index-selected" : ""}
                onClick={() => setSelectedProposalId(item.id)}
                aria-current={item.id === proposal.id ? "true" : undefined}
              >
                <span>{item.id}</span>
                <strong>{itemReview ? DECISION_LABELS[itemReview.decision] : "Unreviewed"}</strong>
              </button>
            );
          })}
        </nav>

        <article className="proposal-card" aria-labelledby="selected-proposal-title">
          <header className="proposal-card-header">
            <div>
              <p className="eyebrow">
                Proposal {proposal.id}
                {proposal.generation ? " · AI-generated for human review" : ""}
              </p>
              <h3 id="selected-proposal-title">Proposed statement</h3>
            </div>
            {review ? (
              <StatusBadge tone={review.decision === "reject" ? "rejected" : review.decision === "hold" ? "held" : "accepted"}>
                {DECISION_LABELS[review.decision]}
              </StatusBadge>
            ) : <StatusBadge tone="pending">Unreviewed</StatusBadge>}
          </header>

          <blockquote className="proposal-statement">{proposal.statement}</blockquote>

          <div className="proposal-evidence">
            <div>
              <span className="detail-label">Supporting excerpt</span>
              <q>{proposal.supportingExcerpts[0]}</q>
            </div>
            <dl>
              <div><dt>Source</dt><dd>{proposal.sourceIds.join(", ")} · {source?.title}</dd></div>
              <div><dt>Authority</dt><dd>{proposal.authorityLabel}</dd></div>
              <div><dt>Uncertainty</dt><dd>{humanize(proposal.uncertainty)}</dd></div>
              <div><dt>Eligible outputs</dt><dd>{proposal.eligibleOutputs.map(humanize).join(" · ")}</dd></div>
              <div><dt>Timeline</dt><dd>{proposal.timelineCandidate ? `Eligible · ${proposal.timelineCandidate.date}` : "Not timeline-eligible"}</dd></div>
            </dl>
          </div>

          {!review && proposal.boundedEdits.length ? (
            <fieldset className="edit-options">
              <legend>Approved bounded edit</legend>
              {proposal.boundedEdits.map((option) => (
                <label key={option.id}>
                  <input
                    type="radio"
                    name={`edit-${proposal.id}`}
                    value={option.id}
                    checked={editOptionId === option.id}
                    onChange={() => setEditOptionId(option.id)}
                  />
                  <span><strong>{option.label}</strong>{option.correctedStatement}</span>
                </label>
              ))}
              <p>No free-text editing is available in this demonstration.</p>
            </fieldset>
          ) : null}

          {!review ? (
            <div className="decision-actions" aria-label={`Review actions for ${proposal.id}`}>
              <button className="button button-accept" type="button" disabled={isBusy} onClick={() => decide("accept")}>Accept</button>
              {proposal.boundedEdits.length ? (
                <button className="button button-edit" type="button" disabled={isBusy || !editOptionId} onClick={() => decide("edit")}>Apply bounded edit</button>
              ) : null}
              <button className="button button-reject" type="button" disabled={isBusy} onClick={() => decide("reject")}>Reject</button>
              <button className="button button-hold" type="button" disabled={isBusy} onClick={() => decide("hold")}>Hold</button>
            </div>
          ) : (
            <div className="decision-result" role="status">
              <div>
                <p><strong>Human decision:</strong> {DECISION_LABELS[review.decision]} at revision {review.revision}.</p>
                {acceptedStatement ? (
                  <p className="decision-accepted-text"><strong>Accepted statement:</strong> {acceptedStatement.text}</p>
                ) : (
                  <p className="decision-absent-text">No accepted statement entered case state.</p>
                )}
              </div>
              <button className="text-button" type="button" onClick={() => onTrace(review.acceptedStatementId ?? proposal.id)}>
                Inspect {review.decision === "reject" ? "rejected" : "statement"} provenance
              </button>
            </div>
          )}

          <div className="queue-controls">
            <button type="button" className="button button-secondary" onClick={() => movePending(-1)} disabled={!pending.length}>← Previous pending</button>
            <span>{pending.length ? `${pending.length} proposals await a decision` : "Review queue complete"}</span>
            <button type="button" className="button button-secondary" onClick={() => movePending(1)} disabled={!pending.length}>Next pending →</button>
          </div>
        </article>
      </div>
    </section>
  );
}

function TimelinePanel({ onTrace }: Readonly<{
  onTrace(statementId: string): void;
}>) {
  const { acceptedStatements, sources, timeline } = useCaseNavigator();
  const ordered = [...timeline].sort((left, right) => left.date.localeCompare(right.date));

  return (
    <section className="section" id="timeline" aria-labelledby="timeline-title">
      <div className="section-heading">
        <p className="eyebrow">Accepted case only</p>
        <h2 id="timeline-title">Case timeline</h2>
        <p>Rejected and held proposals never appear here.</p>
      </div>
      {ordered.length ? (
        <ol className="timeline-list">
          {ordered.map((event) => {
            const statement = acceptedStatements.find((item) => item.id === event.acceptedStatementId);
            const source = sources.find((item) => item.id === event.sourceIds[0]);
            return (
              <li key={event.id}>
                <time dateTime={event.date}>{event.date}</time>
                <div className="timeline-marker" aria-hidden="true" />
                <article>
                  <h3>{event.label}</h3>
                  <p>{statement?.text}</p>
                  <div className="timeline-meta">
                    <span>{event.sourceIds.join(", ")} · {source?.title}</span>
                    <span>{statement?.authorityLabel}</span>
                    <span>{statement ? humanize(statement.uncertainty) : ""}</span>
                  </div>
                  <button type="button" className="text-button" onClick={() => onTrace(event.acceptedStatementId)}>Trace this statement</button>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="empty-state">
          <span aria-hidden="true">○</span>
          <h3>No accepted timeline events yet</h3>
          <p>Accept a timeline-eligible proposal to build the human-reviewed chronology.</p>
        </div>
      )}
    </section>
  );
}

function PacketPreview({ output, onTrace }: Readonly<{
  output: GeneratedOutput;
  onTrace(statementId: string): void;
}>) {
  return (
    <article className="packet-preview" aria-label={output.title}>
      <header>
        <p className="packet-kicker">Synthetic draft · Version {output.version.version}</p>
        <h3>{output.title}</h3>
        <p className="packet-notice">{output.nonprofessionalAdviceNotice}</p>
      </header>
      {output.sections.map((section) => (
        <section key={section.id} aria-labelledby={`${output.id}-${section.id}`}>
          <h4 id={`${output.id}-${section.id}`}>{section.title}</h4>
          <ul>
            {section.statements.map((statement) => (
              <li key={statement.acceptedStatementId} data-statement-id={statement.acceptedStatementId}>
                <p>{statement.text}</p>
                <dl>
                  <div><dt>Source / authority</dt><dd>{statement.authorityLabel} ({statement.sourceIds.join(", ")})</dd></div>
                  <div><dt>Label</dt><dd>{humanize(statement.uncertainty)}</dd></div>
                </dl>
                <button type="button" className="text-button" onClick={() => onTrace(statement.acceptedStatementId)}>Inspect provenance</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

function OutputPreviews({ onTrace }: Readonly<{
  onTrace(statementId: string): void;
}>) {
  const {
    acceptedStatements,
    generateOutputs,
    isBusy,
    outputs,
  } = useCaseNavigator();
  const ready = acceptedStatements.length > 0;

  return (
    <section className="section output-section" id="outputs" aria-labelledby="outputs-title">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Deterministic projections</p>
          <h2 id="outputs-title">Packet previews</h2>
          <p>Only accepted case state is projected. These are not official forms or submissions.</p>
        </div>
        <div className="decision-actions">
          <button className="button button-primary" type="button" onClick={generateOutputs} disabled={!ready || isBusy}>
            {outputs.ssa_disability_intake ? "Refresh both previews" : "Generate both previews"}
          </button>
        </div>
      </div>
      {!ready ? (
        <div className="empty-state empty-state-light">
          <span aria-hidden="true">▤</span>
          <h3>Accepted evidence is required</h3>
          <p>Accept or apply a bounded edit to at least one proposal before generating previews.</p>
        </div>
      ) : outputs.ssa_disability_intake && outputs.neurology_background ? (
        <div className="packet-grid">
          <PacketPreview output={outputs.ssa_disability_intake} onTrace={onTrace} />
          <PacketPreview output={outputs.neurology_background} onTrace={onTrace} />
        </div>
      ) : (
        <div className="empty-state empty-state-light">
          <span aria-hidden="true">✓</span>
          <h3>Accepted evidence is ready</h3>
          <p>Generate both previews to demonstrate output reuse and rejected-statement exclusion.</p>
        </div>
      )}
    </section>
  );
}

function ProvenancePanel({
  selectedTraceId,
  setSelectedTraceId,
}: Readonly<{
  selectedTraceId: string;
  setSelectedTraceId(id: string): void;
}>) {
  const {
    acceptedStatements,
    outputs,
    proposals,
    reviews,
    sources,
    timeline,
    traceStatement,
  } = useCaseNavigator();
  const traceable = [
    ...acceptedStatements.map((statement) => ({ id: statement.id, label: statement.text })),
    ...reviews
      .filter((review) => review.decision === "reject")
      .map((review) => ({
        id: review.proposalId,
        label: proposals.find((proposal) => proposal.id === review.proposalId)?.statement ?? review.proposalId,
      })),
  ];
  const activeId = traceable.some((item) => item.id === selectedTraceId)
    ? selectedTraceId
    : traceable[0]?.id ?? "";
  const trace = activeId ? traceStatement(activeId) : null;
  const appearanceKinds = trace?.outputAppearances.map((appearance) => appearance.kind) ?? [];
  void outputs;
  void timeline;

  return (
    <section className="section provenance-section" id="provenance" aria-labelledby="provenance-title">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Evidence to decision to output</p>
          <h2 id="provenance-title">Statement provenance</h2>
          <p>Inspect exactly why a statement appears—or does not appear—in accepted case state.</p>
        </div>
        {traceable.length ? (
          <label className="trace-select">
            <span>Statement to inspect</span>
            <select value={activeId} onChange={(event) => setSelectedTraceId(event.target.value)}>
              {traceable.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.label}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {!trace ? (
        <div className="empty-state">
          <span aria-hidden="true">◎</span>
          <h3>No human decision to trace yet</h3>
          <p>Accept or reject a proposal to open its provenance chain.</p>
        </div>
      ) : (
        <div className="trace-flow">
          <article className="trace-node trace-source">
            <span>01 · Preserved source</span>
            <h3>{trace.supportingSourceIds.join(", ")}</h3>
            <p>{trace.supportingSourceIds.map((id) => sources.find((source) => source.id === id)?.title).filter(Boolean).join(" · ")}</p>
            <q>{trace.supportingExcerpts[0]}</q>
            <small>{trace.authorityLabel}</small>
          </article>
          <span className="trace-connector" aria-hidden="true">→</span>
          <article className="trace-node trace-proposal">
            <span>02 · Original proposal</span>
            <h3>{trace.originalProposal.id}</h3>
            <p>{trace.originalProposal.statement}</p>
            <small>{humanize(trace.originalProposal.uncertainty)}</small>
          </article>
          <span className="trace-connector" aria-hidden="true">→</span>
          <article className="trace-node trace-decision">
            <span>03 · Human decision</span>
            <h3>{trace.humanDecision ? DECISION_LABELS[trace.humanDecision.decision] : "No decision"}</h3>
            <small>{trace.humanDecision ? `Revision ${trace.humanDecision.revision}` : "Outside accepted state"}</small>
          </article>
          <span className="trace-connector" aria-hidden="true">→</span>
          <article className="trace-node trace-accepted">
            <span>04 · Accepted statement</span>
            <h3>{trace.acceptedStatement ? "Entered case state" : "No accepted statement"}</h3>
            <p>{trace.acceptedStatement?.text ?? "No accepted statement was created."}</p>
            <small>{trace.acceptedStatement ? trace.acceptedStatement.id : "Absent by human decision"}</small>
          </article>
          <span className="trace-connector" aria-hidden="true">→</span>
          <article className="trace-node trace-timeline">
            <span>05 · Timeline</span>
            <h3>{trace.timelineAppearance ? "Appears in timeline" : "No timeline appearance"}</h3>
            <p>{trace.timelineAppearance ? trace.timelineAppearance.label : "This content does not appear in the accepted-case timeline."}</p>
            <small>Timeline: {trace.timelineAppearance ? `Yes · ${trace.timelineAppearance.date}` : "No appearance"}</small>
          </article>
          <span className="trace-connector" aria-hidden="true">→</span>
          <article className="trace-node trace-output">
            <span>06 · Outputs</span>
            <h3>{trace.outputAppearances.length ? `${trace.outputAppearances.length} appearance${trace.outputAppearances.length === 1 ? "" : "s"}` : "No output appearances"}</h3>
            <ul>
              <li>SSA packet: {appearanceKinds.includes("ssa_disability_intake") ? "Appears" : "No appearance"}</li>
              <li>Neurology packet: {appearanceKinds.includes("neurology_background") ? "Appears" : "No appearance"}</li>
            </ul>
            <small>{trace.outputAppearances.length ? "Accepted evidence only" : "Absent from generated packets"}</small>
          </article>
        </div>
      )}
    </section>
  );
}

function ResetPanel({ onResetSelections }: Readonly<{
  onResetSelections(): void;
}>) {
  const { isBusy, resetDemo } = useCaseNavigator();
  const [confirming, setConfirming] = useState(false);

  async function confirmReset() {
    await resetDemo();
    onResetSelections();
    setConfirming(false);
  }

  return (
    <section className="section reset-section" aria-labelledby="reset-title">
      <div>
        <p className="eyebrow">Repeatable demonstration</p>
        <h2 id="reset-title">Return to the exact initial state</h2>
        <p>Reset removes every decision, accepted statement, timeline event, and generated preview.</p>
      </div>
      {!confirming ? (
        <button className="button button-secondary" type="button" onClick={() => setConfirming(true)}>Reset synthetic demo</button>
      ) : (
        <div className="reset-confirm" role="alertdialog" aria-labelledby="reset-confirm-title" aria-describedby="reset-confirm-description">
          <strong id="reset-confirm-title">Reset every review decision?</strong>
          <p id="reset-confirm-description">This restores revision 0 and the eight unreviewed proposals.</p>
          <div>
            <button className="button button-reject" type="button" disabled={isBusy} onClick={confirmReset}>Confirm reset</button>
            <button className="button button-secondary" type="button" onClick={() => setConfirming(false)}>Keep current review</button>
          </div>
        </div>
      )}
    </section>
  );
}

function NavigatorContent() {
  const overviewRef = useRef<HTMLElement>(null);
  const [selectedProposalId, setSelectedProposalId] = useState("P01");
  const [selectedTraceId, setSelectedTraceId] = useState("");

  function openProposal(proposalId: string) {
    setSelectedProposalId(proposalId);
    document.getElementById("proposal-review")?.focus({ preventScroll: true });
  }

  function resetSelections() {
    setSelectedProposalId("P01");
    setSelectedTraceId("");
  }

  return (
    <>
      <OpeningHook overviewRef={overviewRef} />
      <FeedbackBar />
      <main>
        <CaseOverview overviewRef={overviewRef} />
        <SourceLibrary onOpenProposal={openProposal} />
        <ProposalReview
          selectedProposalId={selectedProposalId}
          setSelectedProposalId={setSelectedProposalId}
          onTrace={setSelectedTraceId}
        />
        <TimelinePanel onTrace={setSelectedTraceId} />
        <OutputPreviews onTrace={setSelectedTraceId} />
        <ProvenancePanel selectedTraceId={selectedTraceId} setSelectedTraceId={setSelectedTraceId} />
        <ResetPanel onResetSelections={resetSelections} />
      </main>
      <footer className="site-footer">
        <strong>Neverlost Case Navigator</strong>
        <p>Synthetic demonstration only. Not medical, legal, benefits, or other professional advice.</p>
        <p>No official SSA form, completed application, provider-authored record, legal submission, disability determination, or clinical recommendation is produced.</p>
      </footer>
    </>
  );
}

export function CaseNavigatorDemo() {
  return (
    <ClientDemoProvider>
      <NavigatorContent />
    </ClientDemoProvider>
  );
}
