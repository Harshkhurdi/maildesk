/* ── OpenRouter wire types (subset we consume) ───────────────── */

export interface OpenRouterPricing {
  prompt?: string;
  completion?: string;
  request?: string;
  image?: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  created?: number;
  description?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: OpenRouterPricing;
  supported_parameters?: string[];
  top_provider?: { context_length?: number };
}

/** A model this app is allowed to use — zero cost, verified server-side. */
export interface FreeModel {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  vision: boolean;
  reasoning: boolean;
  tools: boolean;
}

/* ── Chat message types ──────────────────────────────────────── */

export type MessageRole = "system" | "user" | "assistant";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image_url";
  image_url: { url: string }; // data: URL or https URL
}

export interface FilePart {
  type: "file";
  file: { filename: string; file_data: string }; // data URL
}

export type ContentPart = TextPart | ImagePart | FilePart;

export interface ChatMessageParam {
  role: MessageRole;
  content: string | ContentPart[];
}

/* ── Streaming delta shape ───────────────────────────────────── */

export interface StreamDelta {
  content?: string;
  reasoning?: string;
  finish_reason?: string | null;
}

/* ── Non-streaming response shape (subset) ───────────────────── */

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: MessageRole; content: string | null };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}