import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { OPENAI_MODEL } from "@/ai/schemas";

export class OpenAIConfigurationError extends Error {
  constructor() {
    super("The optional OpenAI feature is not configured.");
    this.name = "OpenAIConfigurationError";
  }
}

export class OpenAIRefusalError extends Error {
  constructor() {
    super("OpenAI declined to produce the requested structured proposal.");
    this.name = "OpenAIRefusalError";
  }
}

export interface OpenAIRequestErrorDetails {
  status: number;
  code: string;
}

export function getOpenAIRequestErrorDetails(
  error: unknown,
): OpenAIRequestErrorDetails | null {
  if (!(error instanceof OpenAI.APIError)) {
    return null;
  }
  return {
    status: error.status,
    code: error.code ?? error.type ?? "openai_api_error",
  };
}

export interface StructuredOutputRequest<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  instructions: string;
  input: string;
  maxOutputTokens: number;
}

export interface StructuredOutputResponse<T> {
  parsed: T;
  responseId: string;
  model: string;
}

export type StructuredOutputRunner = <T>(
  request: StructuredOutputRequest<T>,
) => Promise<StructuredOutputResponse<T>>;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (typeof window !== "undefined") {
    throw new OpenAIConfigurationError();
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new OpenAIConfigurationError();
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export const runStructuredOutput: StructuredOutputRunner = async <T>(
  request: StructuredOutputRequest<T>,
): Promise<StructuredOutputResponse<T>> => {
  const response = await getClient().responses.parse({
    model: OPENAI_MODEL,
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: request.maxOutputTokens,
    reasoning: { effort: "low" },
    store: false,
    tools: [],
    text: {
      format: zodTextFormat(request.schema, request.schemaName),
    },
  });

  if (response.output_parsed === null) {
    throw new OpenAIRefusalError();
  }
  return {
    parsed: request.schema.parse(response.output_parsed),
    responseId: response.id,
    model: response.model,
  };
};
