import { NextResponse } from "next/server";
import { z } from "zod";
import { OpenAIProposalGenerationAdapter } from "@/ai/openai-proposal-generation-adapter";
import {
  getOpenAIRequestErrorDetails,
  OpenAIConfigurationError,
} from "@/ai/openai-client";
import { SourceIdSchema } from "@/ai/schemas";
import { orchestrateProposalGeneration } from "@/services/proposal-generation-orchestrator";

const RequestSchema = z
  .object({
    sourceIds: z.array(SourceIdSchema).length(1),
    localRunId: z.string().min(1).max(100),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export async function POST(request: Request) {
  if (process.env.ENABLE_LIVE_AI !== "true") {
    return NextResponse.json(
      {
        error:
          "Live AI generation is disabled in this public demonstration. It can be enabled for guided demonstrations.",
      },
      { status: 503 },
    );
  }

  try {
    const input = RequestSchema.parse(await request.json());
    const result = await orchestrateProposalGeneration(
      input,
      new OpenAIProposalGenerationAdapter(),
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Submit exactly one approved synthetic source ID and bounded run metadata." },
        { status: 400 },
      );
    }
    if (error instanceof OpenAIConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    const apiError = getOpenAIRequestErrorDetails(error);
    if (apiError) {
      return NextResponse.json(
        {
          error:
            apiError.code === "billing_not_active"
              ? "OpenAI API billing is not active for this project."
              : "The OpenAI API request could not be completed.",
          code: apiError.code,
        },
        { status: apiError.status === 429 ? 503 : 502 },
      );
    }
    return NextResponse.json(
      { error: "OpenAI could not produce a valid evidence-preserving proposal." },
      { status: 502 },
    );
  }
}
