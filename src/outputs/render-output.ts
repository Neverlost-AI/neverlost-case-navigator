import type {
  AcceptedStatement,
  GeneratedOutput,
  OutputKind,
  OutputSectionData,
} from "@/domain/contracts";
import { NEUROLOGY_BACKGROUND_DEFINITION } from "@/outputs/definitions/neurology-background";
import { SSA_DISABILITY_INTAKE_DEFINITION } from "@/outputs/definitions/ssa-disability-intake";

const NOTICE =
  "Synthetic draft for demonstration only. This is not medical, legal, or other professional advice.";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDefinition(kind: OutputKind) {
  return kind === "ssa_disability_intake"
    ? SSA_DISABILITY_INTAKE_DEFINITION
    : NEUROLOGY_BACKGROUND_DEFINITION;
}

export function renderOutput(
  kind: OutputKind,
  acceptedStatements: readonly AcceptedStatement[],
  version: number,
  generatedAtRevision: number,
): GeneratedOutput {
  const definition = getDefinition(kind);
  const eligible = acceptedStatements.filter((statement) =>
    statement.eligibleOutputs.includes(kind),
  );
  const sections: readonly OutputSectionData[] = definition.sections
    .map(([id, title]) => ({
      id,
      title,
      statements: eligible
        .filter((statement) => statement.outputSections.includes(id))
        .map((statement) => ({
          acceptedStatementId: statement.id,
          text: statement.text,
          authorityLabel: statement.authorityLabel,
          uncertainty: statement.uncertainty,
          sourceIds: statement.sourceIds,
        })),
    }))
    .filter((section) => section.statements.length > 0);

  const sectionHtml = sections
    .map(
      (section) =>
        `<section data-section="${section.id}"><h2>${escapeHtml(section.title)}</h2><ul>${section.statements
          .map(
            (statement) =>
              `<li data-statement-id="${statement.acceptedStatementId}"><p>${escapeHtml(statement.text)}</p><p><strong>Source/authority:</strong> ${escapeHtml(statement.authorityLabel)} (${statement.sourceIds.join(", ")})</p><p><strong>Label:</strong> ${escapeHtml(statement.uncertainty)}</p></li>`,
          )
          .join("")}</ul></section>`,
    )
    .join("");
  const html = `<article data-output-kind="${kind}"><header><h1>${escapeHtml(definition.title)}</h1><p><strong>SYNTHETIC DRAFT</strong></p><p>${escapeHtml(NOTICE)}</p></header>${sectionHtml}</article>`;

  return {
    id: `${kind}-v${version}`,
    kind,
    title: definition.title,
    syntheticDraft: true,
    nonprofessionalAdviceNotice: NOTICE,
    version: {
      version,
      generatedAtRevision,
      deterministicLabel: `revision-${generatedAtRevision}-version-${version}`,
    },
    sections,
    html,
  };
}
