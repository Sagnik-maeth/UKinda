import { GoogleGenAI } from "@google/genai";

type GeminiGlobal = typeof globalThis & {
  __genai?: GoogleGenAI;
};

const globalForGemini = globalThis as GeminiGlobal;

export function ai() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured; add a Google AI Studio key to the root .env file");
  }
  return globalForGemini.__genai ??= new GoogleGenAI({ apiKey });
}

export const MODELS = {
  embed: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",
  fast: process.env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash-lite",
  smart: process.env.GEMINI_SMART_MODEL ?? "gemini-3.8-flash",
} as const;

export const EMBED_DIM = Number(process.env.EMBED_DIM ?? 768);

if (EMBED_DIM !== 768) {
  throw new Error(`EMBED_DIM must be 768 to match the PostgreSQL vector column; received ${EMBED_DIM}`);
}

function statusFrom(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  const nested = typeof record.error === "object" && record.error !== null
    ? record.error as Record<string, unknown>
    : undefined;
  const status = Number(record.status ?? record.code ?? nested?.code);
  return Number.isFinite(status) ? status : undefined;
}

export async function withRetry<T>(operation: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const status = statusFrom(error);
      if (attempt + 1 >= tries || ![429, 500, 503].includes(status ?? 0)) {
        throw error;
      }
      const delay = 1000 * (2 ** attempt) + Math.random() * 300;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
