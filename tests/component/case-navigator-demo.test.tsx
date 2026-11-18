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
    name: new RegExp(`${proposalId} (?:Unreviewed|Accepted|Rejected|Held)`),
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
        name: "Maya has one life, but her story is scattered across six records.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Neverlost turns fragmented records into one human-reviewed case foundation/),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Maya Bennett" })).toBeInTheDocument();
    expect(screen.getByText(/NL-BFG-001/)).toBeInTheDocument();
    expect(screen.getAllByText(/Synthetic demonstration only/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No official SSA form/)).toBeInTheDocument();

    const openCase = screen.getByRole("button", { name: /Open Maya’s case/ });
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
    expect(within(detail).getByText("Synthetic cardiology record")).toBeInTheDocument();
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
    const revisionMetric = screen.getByText("State revision").closest("article");
    expect(within(revisionMetric!).getByText("0")).toBeInTheDocument();
  });

  it("accepts supported POTS evidence and adds only the accepted event to the timeline", async () => {
    renderDemo();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(
      await screen.findByRole("heading", {
        name: "Cardiology evaluation documented findings consistent with POTS.",
      }),
    ).toBeInTheDocument();
    const acceptedMetric = screen.getByText("Accepted statements").closest("article");
    expect(acceptedMetric).not.toBeNull();
    expect(within(acceptedMetric!).getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Proposal P01", { selector: ".eyebrow" })).toBeInTheDocument();
    const result = within(
      screen.getByRole("article", { name: "Proposed statement" }),
    ).getByRole("status");
    expect(result).toHaveTextContent("Human decision: Accepted at revision 1");
    expect(result).toHaveTextContent(
      "Accepted statement: Cardiology documented findings consistent with POTS",
    );
  });

  it("rejects unsupported autonomic testing without adding accepted timeline or output state", async () => {
    renderDemo();
    await selectProposal("P02");

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(proposalButton("P02")).toHaveTextContent("Rejected"));
    const result = within(
      screen.getByRole("article", { name: "Proposed statement" }),
    ).getByRole("status");
    expect(result).toHaveTextContent("Human decision: Rejected at revision 1");
    expect(result).toHaveTextContent("No accepted statement entered case state.");

    expect(screen.getByRole("heading", { name: "No accepted timeline events yet" }))
      .toBeInTheDocument();
    await selectProposal("P02");
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect rejected provenance" }),
    );
    const provenance = screen.getByRole("region", { name: "Statement provenance" });
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
    expect(screen.getByText(/No free-text editing is available/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply bounded edit" }));
    await waitFor(() => expect(proposalButton("P03")).toHaveTextContent("Accepted"));
    expect(
      within(screen.getByRole("article", { name: "Proposed statement" })).getByRole("status"),
    ).toHaveTextContent(
      "Accepted statement: Maya reports that she can sometimes use a computer",
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate both previews" }));
    const ssa = await screen.findByRole("article", {
      name: "SSA Disability Intake Packet — Synthetic Draft",
    });
    expect(
      within(ssa).getByText(
        "Maya reports that she can sometimes use a computer for approximately 30 to 45 minutes before symptoms increase, but she cannot necessarily repeat that activity throughout a full day.",
      ),
    ).toBeInTheDocument();
    expect(within(ssa).getByText("client reported")).toBeInTheDocument();
    expect(within(ssa).queryByText(/60 minutes/)).not.toBeInTheDocument();
  });

  it("holds an unresolved proposal outside accepted state", async () => {
    renderDemo();
    await selectProposal("P06");

    fireEvent.click(screen.getByRole("button", { name: "Hold" }));
    await waitFor(() => expect(proposalButton("P06")).toHaveTextContent("Held"));
    const result = within(
      screen.getByRole("article", { name: "Proposed statement" }),
    ).getByRole("status");
    expect(result).toHaveTextContent("Human decision: Held at revision 1");
    expect(result).toHaveTextContent("No accepted statement entered case state.");

    const acceptedMetric = screen.getByText("Accepted statements").closest("article");
    expect(acceptedMetric).not.toBeNull();
    expect(within(acceptedMetric!).getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No accepted timeline events yet" }))
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
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(proposalButton("P01")).toHaveTextContent("Accepted"));
    await selectProposal("P02");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(proposalButton("P02")).toHaveTextContent("Rejected"));

    fireEvent.click(screen.getByRole("button", { name: "Generate both previews" }));
    const ssa = await screen.findByRole("article", {
      name: "SSA Disability Intake Packet — Synthetic Draft",
    });
    const neurology = screen.getByRole("article", {
      name: "Neurology Referral Background Packet — Synthetic Draft",
    });
    for (const packet of [ssa, neurology]) {
      expect(within(packet).getByText("Cardiology documented findings consistent with POTS."))
        .toBeInTheDocument();
      expect(within(packet).queryByText("Formal autonomic testing confirmed severe dysautonomia."))
        .not.toBeInTheDocument();
      expect(within(packet).getByText(/not medical, legal, or other professional advice/i))
        .toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Trace this statement" }));
    const provenance = screen.getByRole("region", { name: "Statement provenance" });
    expect(within(provenance).getByText("S02", { selector: "h3" })).toBeInTheDocument();
    expect(within(provenance).getByText(/Orthostatic measurements/)).toBeInTheDocument();
    expect(within(provenance).getByText("P01", { selector: "h3" })).toBeInTheDocument();
    expect(within(provenance).getByText("Accepted", { selector: "h3" })).toBeInTheDocument();
    expect(within(provenance).getByText(/Timeline: Yes/)).toBeInTheDocument();
    expect(within(provenance).getByText("SSA packet: Appears")).toBeInTheDocument();
    expect(within(provenance).getByText("Neurology packet: Appears")).toBeInTheDocument();
  });

  it("confirms reset and restores the exact initial interface state", async () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(proposalButton("P01")).toHaveTextContent("Accepted"));
    fireEvent.click(screen.getByRole("button", { name: "Generate both previews" }));
    await screen.findByRole("article", {
      name: "SSA Disability Intake Packet — Synthetic Draft",
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset synthetic demo" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Reset every review decision?",
    });
    expect(within(dialog).getByRole("button", { name: "Keep current review" }))
      .toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm reset" }));

    await waitFor(() => expect(proposalButton("P01")).toHaveTextContent("Unreviewed"));
    expect(screen.getByRole("heading", { name: "No accepted timeline events yet" }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Accepted evidence is required" }))
      .toBeInTheDocument();
    const progressMetric = screen
      .getByText("Proposal review", { selector: ".metric-card > span" })
      .closest("article");
    expect(progressMetric).not.toBeNull();
    expect(within(progressMetric!).getByText("0 / 8")).toBeInTheDocument();
    const revisionMetric = screen.getByText("State revision").closest("article");
    expect(revisionMetric).not.toBeNull();
    expect(within(revisionMetric!).getByText("0")).toBeInTheDocument();
  });
});
