import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseNavigatorDemo } from "@/components/case-navigator-demo";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDemo() {
  return render(<CaseNavigatorDemo />);
}

function proposalButton(proposalId: string) {
  return screen.getByRole("button", {
    name: new RegExp(`${proposalId} (?:Unreviewed|Included|Left out|Set aside)`),
  });
}

function openAiResult(localRunId = "proposal-run-0001", marker = "live") {
  const proposalId = `AI-S02-${marker}-01`;
  return {
    run: {
      localRunId,
      provider: "openai",
      model: "gpt-5.6-terra",
      providerResponseId: `resp_${marker}`,
      schemaVersion: "neverlost-proposal-v1",
      instructionVersion: "source-extraction-v1",
      sourceIds: ["S02"],
      sourceSetFingerprint: "fnv1a32:source",
      startedAt: "2026-08-20T00:00:00.000Z",
      completedAt: "2026-08-20T00:00:01.000Z",
      validationResult: "passed",
      candidateIds: [proposalId],
      deterministicResultHash: `fnv1a32:${marker}`,
      idempotencyKey: `${localRunId}:S02`,
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
          runId: localRunId,
        },
      },
    ],
  };
}

async function selectProposal(proposalId: string) {
  fireEvent.click(proposalButton(proposalId));
  await waitFor(() =>
    expect(
      screen.getByText(`Proposal ${proposalId}`, { selector: ".eyebrow" }),
    ).toBeInTheDocument(),
  );
}

describe("Tranche 2 case navigator journey", () => {
  it("renders the opening hook, case overview, limitations, and keyboard-ready primary action", () => {
    const { container } = renderDemo();

    const brandLink = screen.getByRole("link", {
      name: "Neverlost Case Navigator home",
    });
    expect(
      within(brandLink).getByAltText(
        "Neverlost NVLT logo — Governed, Testable, Bounded.",
      ),
    ).toHaveAttribute("src", "/brand/nvlt-youtube-logo.png");
    expect(within(brandLink).getByText("Neverlost Case Navigator")).toBeInTheDocument();
    expect(container.querySelectorAll(".wordmark img")).toHaveLength(1);

    expect(
      screen.getByRole("heading", {
        name: "Prepare a clearer picture for your next conversation.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Case Navigator explores how to bring relevant information together/),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Maya Bennett" })).toBeInTheDocument();
    
    expect(screen.getByText("This demonstration uses fictional information. Nothing is sent to a provider.")).toBeInTheDocument();
    expect(screen.getByText("Demonstration with fictional information. Not medical, legal, or benefits advice.")).toBeInTheDocument();
    expect(screen.queryByText(/No official SSA form/)).not.toBeInTheDocument();

    const openCase = screen.getByRole("button", { name: /Explore Maya’s example/ });
    expect(openCase.tagName).toBe("BUTTON");
    openCase.focus();
    expect(openCase).toHaveFocus();
    fireEvent.click(openCase);
    expect(screen.getByRole("heading", { name: "Maya Bennett" }).closest("section"))
      .toHaveFocus();
  });

  it("shows exactly six sources and opens a readable source detail", () => {
    const { container } = renderDemo();

    const fragments = container.querySelectorAll(".record-slip");
    expect(fragments).toHaveLength(6);
    fragments.forEach((fragment) => {
      expect(fragment).not.toHaveAttribute("style");
      expect(fragment.getAttribute("style") ?? "").not.toMatch(/rotate|skew/i);
    });

    const sourceButtons = screen.getAllByRole("button", { name: /^View S0/ });
    expect(sourceButtons).toHaveLength(6);
    const sourceLibrary = container.querySelector(".source-list");
    expect(sourceLibrary).not.toBeNull();
    expect(within(sourceLibrary as HTMLElement).getAllByRole("button")).toHaveLength(6);
    fireEvent.click(
      screen.getByRole("button", {
        name: "View S02: Cardiology and Orthostatic Evaluation",
      }),
    );

    const detail = screen.getByRole("article", {
      name: "Cardiology and Orthostatic Evaluation",
    });
    expect(within(detail).getByText("Cardiology record")).toBeInTheDocument();
    expect(
      within(detail).getByText(
        "Comprehensive autonomic testing has not yet been completed.",
      ),
    ).toBeInTheDocument();
    expect(within(detail).getByText("What this source supports")).toBeInTheDocument();
    expect(within(detail).getByText("What it does not establish")).toBeInTheDocument();
    expect(
      within(detail).getByRole("button", { name: "Analyze S02 with OpenAI" }),
    ).toHaveClass("source-analysis-button");
  });

  it("sends only a selected synthetic source ID and queues returned AI proposals as unreviewed", async () => {
    const fetchSpy = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      void input;
      void init;
      return new Response(
        JSON.stringify(openAiResult()),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);
    renderDemo();

    fireEvent.click(
      screen.getByRole("button", {
        name: "View S02: Cardiology and Orthostatic Evaluation",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze S02 with OpenAI" }),
    );

    await waitFor(() =>
      expect(proposalButton("AI-S02-live-01")).toHaveTextContent("Unreviewed"),
    );
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/ai/proposals");
    expect(JSON.parse(String(options?.body))).toEqual({
      sourceIds: ["S02"],
      localRunId: "proposal-run-0001",
      idempotencyKey: "proposal-run-0001:S02",
    });
    expect(screen.getByText(/AI-generated for human review/)).toBeInTheDocument();
    const revisionMetric = screen.getByText("Still to review").closest("article");
    expect(within(revisionMetric!).getByText("9")).toBeInTheDocument();
  });

  it("accepts supported POTS evidence and adds only the accepted event to the timeline", async () => {
    renderDemo();

    fireEvent.click(screen.getByRole("button", { name: "Include" }));

    expect(
      await screen.findByRole("heading", {
        name: "Cardiology evaluation documented findings consistent with POTS.",
      }),
    ).toBeInTheDocument();
    const acceptedMetric = screen.getByText("Included statements").closest("article");
    expect(acceptedMetric).not.toBeNull();
    expect(within(acceptedMetric!).getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Proposal P01", { selector: ".eyebrow" })).toBeInTheDocument();
    const result = within(
      screen.getByRole("article", { name: "Suggested statement" }),
    ).getByRole("status");
    expect(result).toHaveTextContent("Your choice: Included.");
    expect(result).toHaveTextContent(
      "Included statement: Cardiology documented findings consistent with POTS",
    );
  });

  it("rejects unsupported autonomic testing without adding accepted timeline or output state", async () => {
    renderDemo();
    await selectProposal("P02");

    fireEvent.click(screen.getByRole("button", { name: "Leave out" }));
    await waitFor(() => expect(proposalButton("P02")).toHaveTextContent("Left out"));
    const result = within(
      screen.getByRole("article", { name: "Suggested statement" }),
    ).getByRole("status");
    expect(result).toHaveTextContent("Your choice: Left out.");
    expect(result).toHaveTextContent("This statement is not included in the drafts.");

    expect(screen.getByRole("heading", { name: "No timeline entries yet" }))
      .toBeInTheDocument();
    await selectProposal("P02");
    fireEvent.click(
      screen.getAllByRole("button", { name: "See source and review history" })[0],
    );
    const provenance = screen.getByRole("region", { name: "Where this information came from" });
    expect(within(provenance).getByText("No accepted statement was created."))
      .toBeInTheDocument();
    expect(within(provenance).getByRole("heading", { name: "No output appearances" }))
      .toBeInTheDocument();
  });

  it("allows only the approved evidence-preserving bounded edit", async () => {
    renderDemo();
    await selectProposal("P03");

    expect(screen.getAllByRole("radio")).toHaveLength(1);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/Free-text editing is not available/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use clarification" }));
    await waitFor(() => expect(proposalButton("P03")).toHaveTextContent("Included"));
    expect(
      within(screen.getByRole("article", { name: "Suggested statement" })).getByRole("status"),
    ).toHaveTextContent(
      "Included statement: Maya reports that she can sometimes use a computer",
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview sample drafts" }));
    const ssa = await screen.findByRole("article", {
      name: "Disability preparation draft",
    });
    expect(
      within(ssa).getByText(
        "Maya reports that she can sometimes use a computer for approximately 30 to 45 minutes before symptoms increase, but she cannot necessarily repeat that activity throughout a full day.",
      ),
    ).toBeInTheDocument();
    expect(within(ssa).getByText("Reported by the patient")).toBeInTheDocument();
    expect(within(ssa).queryByText(/60 minutes/)).not.toBeInTheDocument();
  });

  it("holds an unresolved proposal outside accepted state", async () => {
    renderDemo();
    await selectProposal("P06");

    fireEvent.click(screen.getByRole("button", { name: "Decide later" }));
    await waitFor(() => expect(proposalButton("P06")).toHaveTextContent("Set aside"));
    const result = within(
      screen.getByRole("article", { name: "Suggested statement" }),
    ).getByRole("status");
    expect(result).toHaveTextContent("Your choice: Set aside.");
    expect(result).toHaveTextContent("This statement is not included in the drafts.");

    const acceptedMetric = screen.getByText("Included statements").closest("article");
    expect(acceptedMetric).not.toBeNull();
    expect(within(acceptedMetric!).getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No timeline entries yet" }))
      .toBeInTheDocument();
  });

  it("keeps experimental OpenAI packet drafting out of the accepted demo runtime", () => {
    renderDemo();

    expect(
      screen.queryByRole("button", { name: /Draft accepted case with OpenAI/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Optional OpenAI-assisted packet"),
    ).not.toBeInTheDocument();
  });

  it("projects accepted POTS into both previews, excludes rejected testing, and traces every appearance", async () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: "Include" }));
    await waitFor(() => expect(proposalButton("P01")).toHaveTextContent("Included"));
    await selectProposal("P02");
    fireEvent.click(screen.getByRole("button", { name: "Leave out" }));
    await waitFor(() => expect(proposalButton("P02")).toHaveTextContent("Left out"));

    fireEvent.click(screen.getByRole("button", { name: "Preview sample drafts" }));
    const ssa = await screen.findByRole("article", {
      name: "Disability preparation draft",
    });
    const neurology = screen.getByRole("article", {
      name: "Neurology background draft",
    });
    for (const packet of [ssa, neurology]) {
      expect(within(packet).getByText("Cardiology documented findings consistent with POTS."))
        .toBeInTheDocument();
      expect(within(packet).queryByText("Formal autonomic testing confirmed severe dysautonomia."))
        .not.toBeInTheDocument();
      expect(within(packet).queryByText(/professional advice/i))
        .not.toBeInTheDocument();
    }

    fireEvent.click(within(screen.getByRole("region", { name: "Case timeline" })).getByRole("button", { name: "See source and review history" }));
    const provenance = screen.getByRole("region", { name: "Where this information came from" });
    expect(within(provenance).getByText("S02", { selector: "h3" })).toBeInTheDocument();
    expect(within(provenance).getByText(/Orthostatic measurements/)).toBeInTheDocument();
    expect(within(provenance).getByText("P01", { selector: "h3" })).toBeInTheDocument();
    expect(within(provenance).getByText("Included", { selector: "h3" })).toBeInTheDocument();
    expect(within(provenance).getByText(/Timeline: Yes/)).toBeInTheDocument();
    expect(within(provenance).getByText("SSA packet: Appears")).toBeInTheDocument();
    expect(within(provenance).getByText("Neurology packet: Appears")).toBeInTheDocument();
  });

  it("confirms reset and restores the exact initial interface state", async () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: "Include" }));
    await waitFor(() => expect(proposalButton("P01")).toHaveTextContent("Included"));
    fireEvent.click(screen.getByRole("button", { name: "Preview sample drafts" }));
    await screen.findByRole("article", {
      name: "Disability preparation draft",
    });

    fireEvent.click(screen.getByRole("button", { name: "Restart the example" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Reset every review decision?",
    });
    expect(within(dialog).getByRole("button", { name: "Keep current review" }))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reset" }));

    await waitFor(() => expect(proposalButton("P01")).toHaveTextContent("Unreviewed"));
    expect(screen.getByRole("heading", { name: "No timeline entries yet" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose information for your draft" }))
      .toBeInTheDocument();
    const progressMetric = screen
      .getByText("Suggestions reviewed", { selector: ".metric-card > span" })
      .closest("article");
    expect(progressMetric).not.toBeNull();
    expect(within(progressMetric!).getByText("0 / 8")).toBeInTheDocument();
    const revisionMetric = screen.getByText("Still to review").closest("article");
    expect(revisionMetric).not.toBeNull();
    expect(within(revisionMetric!).getByText("8")).toBeInTheDocument();
  });
});
