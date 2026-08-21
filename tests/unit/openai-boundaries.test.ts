import { describe, expect, it } from "vitest";
import type { AcceptedStatement } from "@/domain/contracts";
import {
  draftDisabilityPacket,
  PACKET_DRAFT_INSTRUCTIONS,
} from "@/ai/draft-disability-packet";
import {
  generateSourceProposals,
  PROPOSAL_EXTRACTION_INSTRUCTIONS,
} from "@/ai/generate-source-proposals";
import type {
  StructuredOutputRequest,
  StructuredOutputResponse,
  StructuredOutputRunner,
} from "@/ai/openai-client";
import { MAYA_SOURCES } from "@/fixtures/maya/sources";
import { POST as disabledPacketDraftPost } from "@/app/api/ai/packet-draft/route";

function runnerReturning(
  value: unknown,
  capture?: (request: StructuredOutputRequest<unknown>) => void,
): StructuredOutputRunner {
  return async <T>(
    request: StructuredOutputRequest<T>,
  ): Promise<StructuredOutputResponse<T>> => {
    capture?.(request as StructuredOutputRequest<unknown>);
    return {
      parsed: request.schema.parse(value),
      responseId: "resp_test",
      model: "gpt-5.6-terra",
    };
  };
}

const acceptedPots: AcceptedStatement = {
  id: "A-P01",
  proposalId: "P01",
  text: "Cardiology documented findings consistent with POTS.",
  origin: "source_derived",
  uncertainty: "supported",
  sourceIds: ["S02"],
  authorityLabel: "Synthetic cardiology record",
  outputSections: ["medical"],
  eligibleOutputs: ["ssa_disability_intake", "neurology_background"],
  acceptedAtRevision: 1,
  edited: false,
};

describe("OpenAI synthetic-data and authority boundaries", () => {
  it("extracts candidates from one preserved synthetic source with an exact excerpt", async () => {
    const source = MAYA_SOURCES[1];
    let requestInput = "";
    let maxOutputTokens = 0;
    const generated = await generateSourceProposals(
      source,
      runnerReturning(
        {
          candidates: [
            {
              statement: "Cardiology documented findings consistent with POTS.",
              supportingExcerpt: source.excerpts[0],
              category: "medical",
              uncertainty: "supported",
              includeInTimeline: true,
              timelineLabel:
                "Cardiology evaluation documented findings consistent with POTS.",
            },
          ],
        },
        (request) => {
          requestInput = request.input;
          maxOutputTokens = request.maxOutputTokens;
        },
      ),
    );

    expect(JSON.parse(requestInput)).toEqual({
      synthetic: true,
      sourceId: "S02",
      title: source.title,
      scope: source.scope,
      authorityLabel: source.authorityLabel,
      recordDate: source.recordDate,
      exactExcerpts: source.excerpts,
    });
    expect(generated.candidates).toEqual([
      expect.objectContaining({
        sourceId: "S02",
        supportingExcerpt: source.excerpts[0],
        generatedByModel: "gpt-5.6-terra",
        outputSections: ["medical"],
      }),
    ]);
    expect(PROPOSAL_EXTRACTION_INSTRUCTIONS).toContain(
      "A human reviewer decides whether anything enters accepted case state",
    );
    expect(generated.responseId).toBe("resp_test");
    expect(maxOutputTokens).toBe(1_000);
  });

  it("rejects a proposal whose cited excerpt is not preserved in the source", async () => {
    const source = MAYA_SOURCES[1];
    await expect(
      generateSourceProposals(
        source,
        runnerReturning({
          candidates: [
            {
              statement: "An invented conclusion.",
              supportingExcerpt: "This sentence does not exist in S02.",
              category: "medical",
              uncertainty: "supported",
              includeInTimeline: false,
              timelineLabel: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow("not a preserved excerpt");
  });

  it("rejects an unsupported authority conclusion even when it cites a real excerpt", async () => {
    const source = MAYA_SOURCES[1];
    await expect(
      generateSourceProposals(
        source,
        runnerReturning({
          candidates: [
            {
              statement: "Formal autonomic testing confirmed severe dysautonomia.",
              supportingExcerpt: source.excerpts[0],
              category: "medical",
              uncertainty: "supported",
              includeInTimeline: false,
              timelineLabel: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow("prohibited authority conclusion");
  });

  it("drafts from accepted statements only and preserves accepted-ID citations", async () => {
    let packetInput = "";
    const draft = await draftDisabilityPacket(
      [acceptedPots],
      runnerReturning(
        {
          title: "OpenAI-assisted Disability Case Packet — Synthetic Draft",
          sections: [
            {
              id: "medical",
              title: "Medical evidence",
              paragraphs: [
                {
                  text: "The accepted cardiology statement documents findings consistent with POTS.",
                  acceptedStatementIds: ["A-P01"],
                },
              ],
            },
          ],
          unresolvedEvidence: [],
        },
        (request) => {
          packetInput = request.input;
        },
      ),
    );

    const submitted = JSON.parse(packetInput) as {
      acceptedStatements: readonly { id: string }[];
    };
    expect(submitted.acceptedStatements.map((item) => item.id)).toEqual(["A-P01"]);
    expect(draft.aiGenerated).toBe(true);
    expect(draft.model).toBe("gpt-5.6-terra");
    expect(draft.sections[0].paragraphs[0].acceptedStatementIds).toEqual(["A-P01"]);
    expect(PACKET_DRAFT_INSTRUCTIONS).toContain(
      "human-accepted synthetic case statements only",
    );
  });

  it("invalidates any packet citation outside accepted case state", async () => {
    await expect(
      draftDisabilityPacket(
        [acceptedPots],
        runnerReturning({
          title: "OpenAI-assisted Disability Case Packet — Synthetic Draft",
          sections: [
            {
              id: "medical",
              title: "Medical evidence",
              paragraphs: [
                {
                  text: "Unsupported text must not survive citation validation.",
                  acceptedStatementIds: ["A-P02"],
                },
              ],
            },
          ],
          unresolvedEvidence: [],
        }),
      ),
    ).rejects.toThrow("outside accepted case state");
  });

  it("keeps experimental OpenAI packet drafting disabled in the accepted runtime", async () => {
    const response = await disabledPacketDraftPost();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error:
        "OpenAI packet drafting is experimental and disabled in the accepted demo runtime.",
    });
  });
});
