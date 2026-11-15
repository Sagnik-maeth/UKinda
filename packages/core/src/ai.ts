import { Type } from "@google/genai";
import { z } from "zod";
import { ai, MODELS, withRetry } from "./gemini";

type LiteProfile = {
  tags: string[];
  weekend: string;
  talkAbout: string;
  lookingFor: string[];
};

const describe = (profile: LiteProfile) =>
  `Interests: ${profile.tags.join(", ")}. Perfect weekend: ${profile.weekend}. ` +
  `Could talk for hours about: ${profile.talkAbout}. Looking for: ${profile.lookingFor.join(", ")}.`;

export async function generateVibe(profile: LiteProfile): Promise<string | null> {
  try {
    const response = await withRetry(() => ai().models.generateContent({
      model: MODELS.fast,
      contents:
        "Write ONE playful line (max 14 words, at most 1 emoji, no names, nothing that could identify the person) " +
        "capturing this college student's vibe for an anonymous friend-matching card. Output only the line.\n\n" +
        describe(profile),
    }), 2);
    return response.text?.trim().replace(/^["']|["']$/g, "").slice(0, 120) || null;
  } catch (error) {
    console.warn("Gemini vibe generation failed; continuing without a vibe line.", error);
    return null;
  }
}

export function templateIcebreakers(first: LiteProfile, second: LiteProfile): string[] {
  const sharedTags = first.tags.filter((tag) => second.tags.includes(tag));
  return [
    sharedTags[0]
      ? `Okay, ${sharedTags[0]} fan: what got you into it?`
      : "What does your perfect weekend look like?",
    sharedTags[1]
      ? `Hot take time: best thing about ${sharedTags[1]}?`
      : "What's something you could talk about for hours?",
    "Quick one: night owl or early bird? 🦉🐦",
  ];
}

const Icebreakers = z.array(z.string().trim().min(1).max(160)).min(1).max(3);

export async function generateIcebreakers(
  first: LiteProfile,
  second: LiteProfile,
): Promise<string[]> {
  try {
    const response = await withRetry(() => ai().models.generateContent({
      model: MODELS.fast,
      contents:
        "Two college students just matched on an anonymous campus friend app. Write 3 short, friendly, specific " +
        "opening messages (max 18 words each) either could send, based on what they have in common. " +
        "Not flirty, no names, no personal details.\n\n" +
        `Person A: ${describe(first)}\nPerson B: ${describe(second)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    }), 2);
    const parsedJson: unknown = JSON.parse(response.text ?? "null");
    const parsed = Icebreakers.safeParse(parsedJson);
    if (parsed.success) return parsed.data.slice(0, 3);
    console.warn("Gemini returned invalid icebreakers; using templates.");
  } catch (error) {
    console.warn("Gemini icebreaker generation failed; using templates.", error);
  }
  return templateIcebreakers(first, second);
}
