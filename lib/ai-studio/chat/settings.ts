"use client";

/** User-configurable generation settings (persisted to localStorage). */
export interface ChatSettings {
  systemPrompt: string;
  jsonMode: boolean;
  temperature: number;
  maxTokens: number | null;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  systemPrompt: "",
  jsonMode: false,
  temperature: 0.7,
  maxTokens: 4096,
};

export interface Preset {
  name: string;
  prompt: string;
}

export const PRESETS: Preset[] = [
  { name: "None", prompt: "" },
  {
    name: "Work planner",
    prompt: "Help turn the user’s notes into a practical plan with clear tasks and next steps. Do not invent facts or deadlines.",
  },
  {
    name: "Code helper",
    prompt:
      "You are a senior software engineer. Give precise, working code with brief explanations. Prefer modern idiomatic style.",
  },
  {
    name: "Translator",
    prompt:
      "Translate the user's text accurately. Detect the source language and respond in the other language (English↔user's language). Output only the translation.",
  },
  {
    name: "Concise",
    prompt: "Answer in the fewest words possible while remaining correct and useful.",
  },
  {
    name: "Explain like I'm five",
    prompt: "Explain everything in very simple language a five-year-old could understand, using fun analogies.",
  },
];