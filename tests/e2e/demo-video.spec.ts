import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  chromium,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";

const VIEWPORT = { width: 1600, height: 900 } as const;
const SCROLL_SETTLE_MS = 700;
const RECORDING_PRESENTATION_STYLES = `
  .review-section {
    padding-bottom: 16rem !important;
  }

  .provenance-section {
    padding-bottom: 10rem !important;
  }

  .output-section {
    padding-bottom: 16rem !important;
  }
`;
const OUTPUT_DIRECTORY = path.join(process.cwd(), "artifacts", "video");
const SCREENSHOT_DIRECTORY = path.join(process.cwd(), "docs", "screenshots");
const RAW_VIDEO_DIRECTORY = path.join(OUTPUT_DIRECTORY, ".raw");
const RAW_CAPTURE_PATH = path.join(OUTPUT_DIRECTORY, ".untrimmed-demo.webm");
const FINAL_VIDEO_PATH = path.join(
  OUTPUT_DIRECTORY,
  "neverlost-case-navigator-demo.webm",
);

const LIVE_S02_REPLAY = {
  run: {
    localRunId: "live-s02-smoke-0001",
    provider: "openai",
    model: "gpt-5.6-terra",
    providerResponseId: "resp_0fc35a52cdcc8074016a87a2681d7c87d1aa76afd807fc1979",
    schemaVersion: "neverlost-proposal-v1",
    instructionVersion: "source-extraction-v1",
    sourceIds: ["S02"],
    sourceSetFingerprint: "fnv1a32:9ec5ac3f",
    startedAt: "2026-08-21T00:57:10.246Z",
    completedAt: "2026-08-21T00:57:14.153Z",
    validationResult: "passed",
    candidateIds: ["AI-S02-739247b8-01", "AI-S02-739247b8-02"],
    deterministicResultHash: "fnv1a32:5de7f663",
    idempotencyKey: "live-s02-smoke-0001:S02",
    status: "completed",
  },
  proposals: [
    {
      id: "AI-S02-739247b8-01",
      statement:
        "A synthetic cardiology record dated 2024-02-14 documents orthostatic measurements and a clinical assessment with findings consistent with POTS.",
      origin: "ai_generated",
      uncertainty: "supported",
      sourceIds: ["S02"],
      supportingExcerpts: [
        "Orthostatic measurements and the clinical assessment document findings consistent with POTS.",
      ],
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
        runId: "live-s02-smoke-0001",
      },
    },
    {
      id: "AI-S02-739247b8-02",
      statement:
        "Comprehensive autonomic testing is not documented as completed in this record.",
      origin: "ai_generated",
      uncertainty: "missing_evidence",
      sourceIds: ["S02"],
      supportingExcerpts: [
        "Comprehensive autonomic testing has not yet been completed.",
      ],
      authorityLabel: "Synthetic cardiology record",
      outputSections: ["missing_evidence"],
      eligibleOutputs: ["ssa_disability_intake", "neurology_background"],
      boundedEdits: [],
      generation: {
        kind: "openai",
        model: "gpt-5.6-terra",
        label: "AI-generated proposal for human review",
        runId: "live-s02-smoke-0001",
      },
    },
  ],
} as const;

type PlaywrightRegistryModule = {
  registry: {
    findExecutable(name: string): {
      executablePath(): null | string;
    };
  };
};

function resolvePlaywrightFfmpeg(): string {
  const rootRequire = createRequire(path.join(process.cwd(), "package.json"));
  const testPackagePath = rootRequire.resolve("@playwright/test/package.json");
  const testRequire = createRequire(testPackagePath);
  const playwrightPackagePath = testRequire.resolve("playwright/package.json");
  const playwrightRequire = createRequire(playwrightPackagePath);
  const registryModule = playwrightRequire(
    "playwright-core/lib/server/registry/index",
  ) as PlaywrightRegistryModule;
  const executablePath = registryModule.registry
    .findExecutable("ffmpeg")
    .executablePath();

  if (!executablePath) {
    throw new Error("The Chromium installation does not include Playwright FFmpeg.");
  }

  return executablePath;
}

async function runProcess(executable: string, args: readonly string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });
  });
}

async function trimStartupFrame() {
  await runProcess(resolvePlaywrightFfmpeg(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    "0.55",
    "-i",
    RAW_CAPTURE_PATH,
    "-map",
    "0:v:0",
    "-an",
    "-c:v",
    "libvpx",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-b:v",
    "2M",
    "-pix_fmt",
    "yuv420p",
    "-y",
    FINAL_VIDEO_PATH,
  ]);
}

async function expectFullyInViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();

  expect(box, "Expected a rendered presentation target").not.toBeNull();
  expect(viewport, "Expected an explicit presentation viewport").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 2);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 2);
}

async function expectViewportBottomInside(page: Page, locator: Locator) {
  expect(
    await locator.evaluate((element) => {
      const bottomCenter = document.elementFromPoint(
        window.innerWidth / 2,
        window.innerHeight - 1,
      );
      return bottomCenter !== null && element.contains(bottomCenter);
    }),
  ).toBe(true);
}

async function show(
  page: Page,
  locator: Locator,
  pauseMs: number,
  fullyVisible = false,
  block: "center" | "start" = "center",
  offsetY = 0,
  instant = false,
) {
  await expect(locator).toBeVisible();
  await locator.evaluate((element, options) => {
    if (options.instant && options.block === "start") {
      window.scrollTo(
        0,
        window.scrollY + element.getBoundingClientRect().top + options.offsetY,
      );
      return;
    }
    if (options.block === "start" && options.offsetY) {
      window.scrollTo({
        behavior: "smooth",
        top: window.scrollY + element.getBoundingClientRect().top + options.offsetY,
      });
      return;
    }
    element.scrollIntoView({
      behavior: "smooth",
      block: options.block,
      inline: "nearest",
    });
  }, { block, instant, offsetY });
  await page.waitForTimeout(SCROLL_SETTLE_MS);
  await expect(locator).toBeVisible();
  if (fullyVisible) await expectFullyInViewport(page, locator);
  await page.waitForTimeout(pauseMs);
}

test("records the corrected presentation-ready case-review journey", async ({
  baseURL,
}) => {
  test.setTimeout(420_000);
  expect(baseURL).toBeTruthy();

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
  await rm(FINAL_VIDEO_PATH, { force: true });
  await rm(RAW_CAPTURE_PATH, { force: true });
  await rm(RAW_VIDEO_DIRECTORY, { recursive: true, force: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-infobars", "--disable-notifications"],
  });

  const warmupContext = await browser.newContext({ viewport: VIEWPORT });
  const warmupPage = await warmupContext.newPage();
  await warmupPage.goto(baseURL!, { waitUntil: "networkidle" });
  await expect(
    warmupPage.getByRole("heading", {
      name: "Maya has one life, but her story is scattered across six records.",
    }),
  ).toBeVisible();
  await expect(
    warmupPage.getByAltText(
      "Neverlost NVLT logo — Governed, Testable, Bounded.",
    ),
  ).toBeVisible();
  await warmupContext.close();

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: RAW_VIDEO_DIRECTORY,
      size: VIEWPORT,
    },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.route("**/api/ai/proposals", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as {
      sourceIds?: readonly string[];
    };
    expect(body.sourceIds).toEqual(["S02"]);
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify(LIVE_S02_REPLAY),
    });
  });
  const recording = page.video();
  let journeyCompleted = false;

  try {
    await page.goto(baseURL!, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: RECORDING_PRESENTATION_STYLES });
    expect(
      await page.evaluate(() => ({
        height: window.innerHeight,
        width: window.innerWidth,
      })),
    ).toEqual({ height: VIEWPORT.height, width: VIEWPORT.width });

    const openingHeading = page.getByRole("heading", {
      name: "Maya has one life, but her story is scattered across six records.",
    });
    const logo = page.getByAltText(
      "Neverlost NVLT logo — Governed, Testable, Bounded.",
    );
    const fragments = page.locator(".record-slip");
    await expect(openingHeading).toBeVisible();
    await expect(logo).toBeVisible();
    await expect(fragments).toHaveCount(6);
    await expect(page.getByText("Synthetic demonstration only").first()).toBeVisible();
    await page.waitForTimeout(7_000);

    await page.getByRole("button", { name: /Open Maya’s case/ }).click();
    const overview = page.getByRole("region", { name: "Maya Bennett" });
    await expect(overview).toBeFocused();
    await expect(overview.getByText("0 / 8")).toBeVisible();
    await show(page, overview, 6_000);

    const sourceLibrary = page.getByRole("region", { name: "Source library" });
    const sourceButtons = sourceLibrary.getByRole("button", { name: /^View S0/ });
    await expect(sourceButtons).toHaveCount(6);
    await expect(sourceLibrary.getByText("Exactly six synthetic records.")).toBeVisible();
    await show(page, sourceLibrary, 7_000, false, "start", 48);

    await sourceLibrary
      .getByRole("button", {
        name: "View S02: Cardiology and Orthostatic Evaluation",
      })
      .click();
    const cardiologySource = page.getByRole("article", {
      name: "Cardiology and Orthostatic Evaluation",
    });
    await expect(
      cardiologySource.getByText(
        "Comprehensive autonomic testing has not yet been completed.",
      ),
    ).toBeVisible();
    await expect(cardiologySource.getByText("What this source supports")).toBeVisible();
    await expect(
      cardiologySource.getByText("What it does not establish"),
    ).toBeVisible();
    await show(page, cardiologySource.locator("header"), 3_000, true, "start");
    await show(page, cardiologySource.locator(".document-text"), 6_000, true);

    await cardiologySource
      .getByRole("button", { name: "Analyze S02 with OpenAI" })
      .click();
    const replayedProposalId = "AI-S02-739247b8-01";
    const proposalReview = page.getByRole("region", { name: "Proposal review" });
    await expect(
      proposalReview.getByRole("button", {
        name: `${replayedProposalId} Unreviewed`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(cardiologySource).toContainText("Optional live analysis");
    await page.waitForTimeout(6_000);

    const demoPath = proposalReview.locator(".demo-path");
    await expect(demoPath.getByRole("button")).toHaveCount(4);
    await show(page, proposalReview, 5_000, false, "start", 0, true);
    await expectFullyInViewport(page, demoPath);

    const proposalCard = proposalReview.getByRole("article", {
      name: "Proposed statement",
    });
    const decisionResult = proposalCard.locator(".decision-result");

    await proposalReview
      .getByRole("button", {
        name: `${replayedProposalId} Unreviewed`,
        exact: true,
      })
      .click();
    await expect(
      proposalCard.getByText(
        "A synthetic cardiology record dated 2024-02-14 documents orthostatic measurements and a clinical assessment with findings consistent with POTS.",
      ),
    ).toBeVisible();
    await expect(proposalCard).toContainText(
      "Orthostatic measurements and the clinical assessment document findings consistent with POTS.",
    );
    await expect(proposalCard).toContainText("AI-generated for human review");
    await show(page, proposalCard, 7_000, true);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIRECTORY, "openai-proposal-unreviewed.png"),
    });
    await proposalCard.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(
      proposalReview.getByRole("button", {
        name: `${replayedProposalId} Accepted`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(decisionResult).toContainText("Human decision: Accepted");
    await expect(decisionResult).toContainText(
      "Accepted statement: A synthetic cardiology record dated 2024-02-14 documents orthostatic measurements and a clinical assessment with findings consistent with POTS.",
    );
    await show(page, proposalCard, 8_000, true);

    await proposalReview
      .getByRole("button", { name: "P02 Unreviewed", exact: true })
      .click();
    await expect(
      proposalCard.getByText(
        "Formal autonomic testing confirmed severe dysautonomia.",
      ),
    ).toBeVisible();
    await show(page, proposalCard, 4_000, true);
    await proposalCard.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(
      proposalReview.getByRole("button", { name: "P02 Rejected", exact: true }),
    ).toBeVisible();
    await expect(decisionResult).toContainText("Human decision: Rejected");
    await expect(decisionResult).toContainText(
      "No accepted statement entered case state.",
    );
    await show(page, proposalCard, 7_000, true);
    await expectViewportBottomInside(page, proposalReview);

    await proposalReview
      .getByRole("button", { name: "P03 Unreviewed", exact: true })
      .click();
    const boundedEdit = proposalCard.getByRole("radio");
    await expect(boundedEdit).toBeChecked();
    await expect(proposalCard).toContainText("approximately 30 to 45 minutes");
    await expect(proposalCard).toContainText(
      "cannot necessarily repeat that activity throughout a full day",
    );
    await expect(proposalCard).not.toContainText("60 minutes");
    await show(page, proposalCard, 5_000, true);
    await proposalCard
      .getByRole("button", { name: "Apply bounded edit", exact: true })
      .click();
    await expect(
      proposalReview.getByRole("button", { name: "P03 Accepted with bounded edit" }),
    ).toBeVisible();
    await expect(decisionResult).toContainText("Accepted statement:");
    await expect(decisionResult).toContainText(
      "cannot necessarily repeat that activity throughout a full day",
    );
    await show(page, proposalCard, 8_000, true);

    await proposalReview
      .getByRole("button", { name: "P06 Unreviewed", exact: true })
      .click();
    await expect(
      proposalCard.getByText(
        "Comprehensive autonomic testing remains missing evidence in this synthetic case.",
      ),
    ).toBeVisible();
    await show(page, proposalCard, 4_000, true);
    await proposalCard.getByRole("button", { name: "Hold", exact: true }).click();
    await expect(
      proposalReview.getByRole("button", { name: "P06 Held", exact: true }),
    ).toBeVisible();
    await expect(decisionResult).toContainText("Human decision: Held");
    await expect(decisionResult).toContainText(
      "No accepted statement entered case state.",
    );
    await show(page, proposalCard, 7_000, true);

    const timeline = page.getByRole("region", { name: "Case timeline" });
    const potsTimelineEntry = timeline.getByRole("heading", {
      name: "Cardiology evaluation documented findings consistent with POTS.",
    });
    await expect(potsTimelineEntry).toBeVisible();
    await expect(timeline).not.toContainText(
      "Formal autonomic testing confirmed severe dysautonomia.",
    );
    await show(page, timeline, 8_000, true, "start");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIRECTORY, "accepted-case-timeline.png"),
    });

    const packets = page.getByRole("region", { name: "Packet previews" });
    await show(page, packets.getByRole("heading", { name: "Packet previews" }), 4_000, true);
    const generateButton = packets.getByRole("button", {
      name: "Generate both previews",
    });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    const ssaPacket = packets.getByRole("article", {
      name: "SSA Disability Intake Packet — Synthetic Draft",
    });
    const neurologyPacket = packets.getByRole("article", {
      name: "Neurology Referral Background Packet — Synthetic Draft",
    });
    const acceptedAiStatementId = `A-${replayedProposalId}`;
    const ssaPotsStatement = ssaPacket.locator(
      `[data-statement-id="${acceptedAiStatementId}"]`,
    );
    const neurologyPotsStatement = neurologyPacket.locator(
      `[data-statement-id="${acceptedAiStatementId}"]`,
    );
    await expect(ssaPacket).toContainText(
      "A synthetic cardiology record dated 2024-02-14 documents orthostatic measurements and a clinical assessment with findings consistent with POTS.",
    );
    await expect(ssaPacket).not.toContainText(
      "Formal autonomic testing confirmed severe dysautonomia.",
    );
    await expect(ssaPacket).toContainText(
      "not medical, legal, or other professional advice",
    );
    await show(page, ssaPacket.locator("header"), 3_000, true);
    await show(page, ssaPotsStatement, 7_000, true);

    await expect(neurologyPacket).toContainText(
      "A synthetic cardiology record dated 2024-02-14 documents orthostatic measurements and a clinical assessment with findings consistent with POTS.",
    );
    await expect(neurologyPacket).not.toContainText(
      "Formal autonomic testing confirmed severe dysautonomia.",
    );
    await expect(neurologyPacket).toContainText(
      "not medical, legal, or other professional advice",
    );
    await show(page, neurologyPacket.locator("header"), 3_000, true);
    await show(page, neurologyPotsStatement, 7_000, true);
    await page.waitForTimeout(4_000);

    await neurologyPotsStatement
      .getByRole("button", { name: "Inspect provenance" })
      .click();
    const provenance = page.getByRole("region", {
      name: "Statement provenance",
    });
    await expect(
      provenance.getByText(replayedProposalId, { exact: true }),
    ).toBeVisible();
    await expect(provenance.getByText("Timeline: Yes", { exact: false })).toBeVisible();
    await expect(
      provenance.getByRole("heading", { name: "2 appearances" }),
    ).toBeVisible();
    await expect(provenance.getByText("SSA packet: Appears")).toBeVisible();
    await expect(provenance.getByText("Neurology packet: Appears")).toBeVisible();
    await show(page, provenance, 10_000, true, "start");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIRECTORY, "statement-provenance.png"),
    });

    const traceSelect = provenance.getByLabel("Statement to inspect");
    await traceSelect.selectOption("P02");
    await expect(
      provenance.getByRole("heading", { name: "Rejected" }),
    ).toBeVisible();
    await expect(provenance.getByText("No accepted statement was created.")).toBeVisible();
    await expect(
      provenance.getByRole("heading", { name: "No timeline appearance" }),
    ).toBeVisible();
    await expect(
      provenance.getByRole("heading", { name: "No output appearances" }),
    ).toBeVisible();
    await show(page, provenance, 9_000, true, "start");

    const acceptedMetric = overview.locator("article").filter({
      hasText: "Accepted statements",
    });
    await expect(acceptedMetric.locator("strong")).toHaveText("2");
    await expect(timeline).not.toContainText(
      "Formal autonomic testing confirmed severe dysautonomia.",
    );
    await expect(ssaPacket).not.toContainText(
      "Formal autonomic testing confirmed severe dysautonomia.",
    );
    await expect(neurologyPacket).not.toContainText(
      "Formal autonomic testing confirmed severe dysautonomia.",
    );

    const resetSection = page.getByRole("region", {
      name: "Return to the exact initial state",
    });
    await show(page, resetSection, 5_000, true, "start");
    await expect(page.locator("footer")).toContainText(
      "Synthetic demonstration only. Not medical, legal, benefits, or other professional advice.",
    );
    await resetSection
      .getByRole("button", { name: "Reset synthetic demo" })
      .click();
    await resetSection.getByRole("button", { name: "Confirm reset" }).click();
    await expect(overview.getByText("0 / 8")).toBeVisible();
    await expect(packets.getByRole("button", { name: "Generate both previews" })).toBeDisabled();
    await page.waitForTimeout(4_000);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(SCROLL_SETTLE_MS);
    await expect(openingHeading).toBeVisible();
    await expect(logo).toBeVisible();
    await expect(
      page.getByText("Neverlost Case Navigator", { exact: true }).first(),
    ).toBeVisible();
    for (let framePulse = 0; framePulse < 7; framePulse += 1) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), framePulse % 2);
      await page.waitForTimeout(1_000);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1_000);

    journeyCompleted = true;
  } finally {
    await context.close();
    if (journeyCompleted && recording) {
      await recording.saveAs(RAW_CAPTURE_PATH);
    }
    await browser.close();
    if (journeyCompleted && recording) {
      await trimStartupFrame();
    }
    await rm(RAW_CAPTURE_PATH, { force: true });
    await rm(RAW_VIDEO_DIRECTORY, { recursive: true, force: true });
  }
});
