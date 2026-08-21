import type { DemoSnapshot, ProvenanceTrace } from "@/domain/contracts";

export function buildTrace(
  state: DemoSnapshot,
  statementOrProposalId: string,
): ProvenanceTrace {
  const acceptedStatement =
    state.acceptedStatements.find(
      (statement) =>
        statement.id === statementOrProposalId ||
        statement.proposalId === statementOrProposalId,
    ) ?? null;
  const proposalId = acceptedStatement?.proposalId ?? statementOrProposalId;
  const originalProposal = state.proposals.find(
    (proposal) => proposal.id === proposalId,
  );
  if (!originalProposal) {
    throw new Error(`Unknown statement or proposal: ${statementOrProposalId}`);
  }
  const humanDecision =
    state.reviews.find((review) => review.proposalId === originalProposal.id) ?? null;
  const timelineAppearance = acceptedStatement
    ? (state.timeline.find(
        (event) => event.acceptedStatementId === acceptedStatement.id,
      ) ?? null)
    : null;
  const outputAppearances = acceptedStatement
    ? state.outputs.flatMap((output) => {
        const sectionIds = output.sections
          .filter((section) =>
            section.statements.some(
              (statement) => statement.acceptedStatementId === acceptedStatement.id,
            ),
          )
          .map((section) => section.id);
        return sectionIds.length > 0
          ? [
              {
                outputId: output.id,
                kind: output.kind,
                sectionIds,
              },
            ]
          : [];
      })
    : [];

  return {
    acceptedStatement,
    originalProposal,
    humanDecision,
    supportingSourceIds: originalProposal.sourceIds,
    supportingExcerpts: originalProposal.supportingExcerpts,
    authorityLabel: originalProposal.authorityLabel,
    timelineAppearance,
    outputAppearances,
  };
}
