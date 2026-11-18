import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";

const VIEWPORT = { width: 1600, height: 900 } as const;
const ASSET_DIRECTORY = path.join(
  process.cwd(),
  "artifacts",
  "video",
  "hybrid-assets",
);
const RAW_DIRECTORY = path.join(ASSET_DIRECTORY, ".raw");
const RAW_CAPTURE = path.join(ASSET_DIRECTORY, ".openai-replay-untrimmed.webm");
const MOTION_CAPTURE = path.join(ASSET_DIRECTORY, "openai-replay-motion.webm");

const CAPTURE_STYLES = `
  html { scroll-behavior: auto !important; }
  body { overflow-x: hidden !important; }
  .topbar {
    position: fixed !important;
    inset: 0 0 auto 0 !important;
    min-height: 62px !important;
    padding-block: .35rem !important;
    background: rgb(4 27 62 / 96%) !important;
  }
  .wordmark-logo { height: 48px !important; }
  #sources {
    width: min(1460px, calc(100% - 2rem)) !important;
    padding: 76px 0 1rem !important;
  }
  #sources .section-heading {
    margin-bottom: .75rem !important;
  }
  #sources .section-heading h2 {
    margin-bottom: .15rem !important;
    font-size: 2rem !important;
  }
  #sources .count-mark { font-size: 3.5rem !important; }
  .source-workbench { grid-template-columns: 285px minmax(0, 1fr) !important; }
  .source-row { padding: .55rem .65rem !important; }
  .source-row-main > span { display: none !important; }
  .source-row-meta { white-space: normal !important; text-align: right !important; }
  .source-detail { padding: 1.1rem 1.35rem !important; }
  .source-detail h3 { font-size: 1.65rem !important; }
  .metadata-list { padding: .65rem 0 !important; }
  .source-detail .related-links[aria-label] { margin-top: .8rem !important; }
  .source-detail .document-text {
    margin: .9rem 0 0 !important;
    padding: .85rem 1rem !important;
  }
  .source-detail .document-text p {
    font-size: .88rem !important;
    line-height: 1.4 !important;
  }
  .source-detail .document-text p:not(:first-of-type),
  .source-detail .evidence-boundaries,
  .source-detail > .related-links:last-child {
    display: none !important;
  }
  .feedback-shell { top: 62px !important; }
  .review-section { padding-top: 82px !important; }
  .proposal-workbench, .proposal-card { scroll-margin-top: 74px !important; }
`;

const LIVE_S02_REPLAY = {
  run: {
    localRunId: "live-s02-smoke-0001",
    provider: "openai",
    model: "gpt-5.6-terra",
    providerResponseId:
      "resp_0fc35a52cdcc8074016a87a2681d7c87d1aa76afd807fc1979",
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
    findExecutable(name: string): { executablePath(): null | string };
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
    throw new Error("Playwright Chromium FFmpeg is unavailable.");
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
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

test("captures cropped hybrid stills and the validated OpenAI replay", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  await mkdir(ASSET_DIRECTORY, { recursive: true });
  await mkdir(RAW_DIRECTORY, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "light",
    reducedMotion: "reduce",
    recordVideo: { dir: RAW_DIRECTORY, size: VIEWPORT },
  });
  const page = await context.newPage();
  const recording = page.video();
  const captureClock = Date.now();
  let motionStart = 0;
  let motionDuration = 0;
  let completed = false;

  await page.route("**/api/ai/proposals", async (route) => {
    const body = route.request().postDataJSON() as { sourceIds?: string[] };
    expect(body.sourceIds).toEqual(["S02"]);
    await page.waitForTimeout(2_400);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(LIVE_S02_REPLAY),
    });
  });

  try {
    await page.goto(baseURL!, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: CAPTURE_STYLES });
    await page.waitForTimeout(7_000);
    await page.screenshot({ path: path.join(ASSET_DIRECTORY, "problem.png") });
    await page.getByRole("button", { name: /Open Maya’s case/ }).click();
    const overview = page.getByRole("region", { name: "Maya Bennett" });
    await expect(overview).toBeFocused();
    await page.waitForTimeout(500);
    const sourceLibrary = page.getByRole("region", { name: "Source library" });
    const s02Button = sourceLibrary.getByRole("button", {
      name: "View S02: Cardiology and Orthostatic Evaluation",
    });
    await expect(s02Button).toHaveAttribute("aria-pressed", "false");
    await s02Button.click({ force: true });
    await expect(s02Button).toHaveAttribute("aria-pressed", "true");
    const source = sourceLibrary.locator("article.source-detail");
    await expect(source.locator("h3")).toHaveText(
      "Cardiology and Orthostatic Evaluation",
    );
    await expect(source).toContainText("Synthetic cardiology record");
    await source.screenshot({ path: path.join(ASSET_DIRECTORY, "preserved-source.png") });

    await source.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -72));
    const analyze = source.getByRole("button", {
      name: "Analyze S02 with OpenAI",
    });
    await expect(analyze).toBeVisible();
    expect(
      await analyze.evaluate((button) => ({
        horizontalFit: button.scrollWidth <= button.clientWidth,
        verticalFit: button.scrollHeight <= button.clientHeight,
      })),
    ).toEqual({ horizontalFit: true, verticalFit: true });
    motionStart = Math.max(0, (Date.now() - captureClock) / 1_000 - 0.2);
    await page.waitForTimeout(4_000);
    await analyze.click();
    await expect(page.locator(".feedback-loading")).toContainText(
      "Updating the deterministic case",
    );
    const proposalReview = page.getByRole("region", { name: "Proposal review" });
    const proposalId = "AI-S02-739247b8-01";
    await expect(
      proposalReview.getByRole("button", {
        name: `${proposalId} Unreviewed`,
        exact: true,
      }),
    ).toBeVisible();
    await page.waitForTimeout(2_500);
    await proposalReview
      .getByRole("button", { name: `${proposalId} Unreviewed`, exact: true })
      .click();
    const proposalCard = proposalReview.getByRole("article", {
      name: "Proposed statement",
    });
    await proposalCard.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -72));
    await expect(proposalCard).toContainText("AI-generated for human review");
    await expect(proposalCard).toContainText(
      "Orthostatic measurements and the clinical assessment document findings consistent with POTS.",
    );
    await page.waitForTimeout(10_000);
    motionDuration = (Date.now() - captureClock) / 1_000 - motionStart;

    await proposalReview.locator(".proposal-workbench").screenshot({
      path: path.join(ASSET_DIRECTORY, "unreviewed-proposal.png"),
    });
    await proposalReview.locator(".demo-path").screenshot({
      path: path.join(ASSET_DIRECTORY, "human-decision-path.png"),
    });
    await proposalCard.locator(".decision-actions").screenshot({
      path: path.join(ASSET_DIRECTORY, "human-decision-controls.png"),
    });
    await proposalCard.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(proposalCard.locator(".decision-result")).toContainText(
      "Human decision: Accepted",
    );

    const timeline = page.getByRole("region", { name: "Case timeline" });
    await expect(timeline).toContainText(
      "Cardiology evaluation documented findings consistent with POTS.",
    );
    await timeline.screenshot({ path: path.join(ASSET_DIRECTORY, "accepted-timeline.png") });

    await proposalReview
      .getByRole("button", { name: "P02 Unreviewed", exact: true })
      .click();
    await proposalCard.getByRole("button", { name: "Reject", exact: true }).click();
    await proposalReview
      .getByRole("button", { name: "P06 Unreviewed", exact: true })
      .click();
    await proposalCard.getByRole("button", { name: "Hold", exact: true }).click();

    const packets = page.getByRole("region", { name: "Packet previews" });
    await packets.getByRole("button", { name: "Generate both previews" }).click();
    const packet = packets.getByRole("article", {
      name: "SSA Disability Intake Packet — Synthetic Draft",
    });
    await expect(packet).not.toContainText(
      "Formal autonomic testing confirmed severe dysautonomia.",
    );
    await packet.screenshot({ path: path.join(ASSET_DIRECTORY, "deterministic-packet.png") });
    await packet
      .getByRole("button", { name: "Inspect provenance" })
      .click();

    const provenance = page.getByRole("region", { name: "Statement provenance" });
    await expect(provenance).toContainText(proposalId);
    await provenance.screenshot({
      path: path.join(ASSET_DIRECTORY, "accepted-provenance.png"),
    });
    await provenance.getByLabel("Statement to inspect").selectOption("P02");
    await expect(provenance).toContainText("No accepted statement was created.");
    await expect(provenance).toContainText("No timeline appearance");
    await expect(provenance).toContainText("No output appearances");
    await provenance.screenshot({
      path: path.join(ASSET_DIRECTORY, "rejected-provenance.png"),
    });
    completed = true;
  } finally {
    await context.close();
    if (completed && recording) {
      await recording.saveAs(RAW_CAPTURE);
    }
  }

  if (!completed) throw new Error("Hybrid asset journey did not complete.");
  await runProcess(resolvePlaywrightFfmpeg(), [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    motionStart.toFixed(3),
    "-i",
    RAW_CAPTURE,
    "-t",
    motionDuration.toFixed(3),
    "-an",
    "-c:v",
    "libvpx",
    "-deadline",
    "realtime",
    "-cpu-used",
    "8",
    "-b:v",
    "3M",
    "-pix_fmt",
    "yuv420p",
    "-y",
    MOTION_CAPTURE,
  ]);
  await rm(RAW_CAPTURE, { force: true });
  await rm(RAW_DIRECTORY, { recursive: true, force: true });
});
