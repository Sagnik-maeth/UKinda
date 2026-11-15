// Run ONCE before the hackathon: `npm run generate-seed -w @campus/core`.
// Makes 6 requests to the "smart" Gemini model and writes seed-profiles.json (commit it).
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { ThinkingLevel, Type } from "@google/genai";
import { ai, MODELS, withRetry } from "../src/gemini";
import { ALL_TAGS, AVAILABILITY, LOOKING_FOR } from "../src/constants";
import { ProfileInput } from "../src/schemas";

const DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "iiitr.ac.in";
const ARCHETYPES = [
  "night-owl gamer who loves anime",
  "gym and sports enthusiast",
  "hackathon and competitive programming grinder",
  "musician / artist / creative",
  "bookish deep-talker",
  "foodie, traveler and social butterfly",
];

const str = { type: Type.STRING };
const profileSchema = {
  type: Type.OBJECT,
  properties: {
    year: { type: Type.INTEGER },
    branch: str,
    sliders: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    tags: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...ALL_TAGS] } },
    lookingFor: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...LOOKING_FOR] } },
    availability: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...AVAILABILITY] } },
    weekend: str,
    talkAbout: str,
    lookingForText: str,
    unpopularOpinion: str,
    favorites: str,
  },
  required: ["year", "sliders", "tags", "lookingFor", "availability", "weekend", "talkAbout", "lookingForText"],
};

type SeedProfile = { email: string } & ProfileInput;

// Progress is saved after each archetype, so a crash or quota hit resumes instead of starting over.
const PROGRESS = new URL("./.generate-seed-progress.json", import.meta.url);
const progress: Record<string, SeedProfile[]> = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, "utf8")) : {};

for (const [i, archetype] of ARCHETYPES.entries()) {
  if (progress[archetype]?.length) {
    console.log(`↺ ${archetype} (${progress[archetype].length} saved)`);
    continue;
  }
  const started = Date.now();
  const batch: SeedProfile[] = [];
  const res = await withRetry(() => ai().models.generateContent({
    model: MODELS.smart,
    contents:
      "Generate 7 distinct profiles of Indian engineering college students (IIIT campus) for an anonymous friend-matching app. " +
      `Archetype: ${archetype}. Make 2 of them blends with another interest. year is 1-4, sliders is exactly 6 integers 1-5 ` +
      "(introvert→extrovert, planner→spontaneous, light→deep talk, comfort→novelty, chill→competitive, early bird→night owl). " +
      "tags: 4-8 items. Free text: casual, specific, varied, 1-2 sentences, no real names.",
    config: {
      responseMimeType: "application/json",
      responseSchema: { type: Type.ARRAY, items: profileSchema },
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, // structured output doesn't need deep reasoning
    },
  }));

  const profiles: unknown = JSON.parse(res.text ?? "[]");
  for (const [j, p] of (Array.isArray(profiles) ? profiles : []).entries()) {
    const parsed = ProfileInput.safeParse({
      ...p,
      branch: typeof p?.branch === "string" ? p.branch.trim().slice(0, 40) || undefined : undefined,
      sliders: p?.sliders?.slice(0, 6),
      tags: p?.tags ? [...new Set<string>(p.tags)].slice(0, 10) : undefined,
    });
    if (parsed.success) {
      batch.push({ email: `seed${String(i * 10 + j).padStart(2, "0")}@${DOMAIN}`, ...parsed.data });
    } else {
      const issue = parsed.error.issues[0];
      console.warn(`  skipped invalid profile: ${issue.path.join(".")}: ${issue.message}`);
    }
  }
  progress[archetype] = batch;
  writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
  console.log(`✓ ${archetype}: ${batch.length} profiles in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

const out: SeedProfile[] = ARCHETYPES.flatMap((archetype) => progress[archetype] ?? []);

// Two hand-written demo accounts that should match each other at the top.
const demo = ProfileInput.parse({
  year: 2,
  sliders: [2, 4, 5, 4, 2, 5],
  tags: ["anime", "PC gaming", "hackathons", "memes", "food & cafés"],
  lookingFor: ["gaming squad", "project/hackathon teammate"],
  availability: ["late night", "weekends"],
  weekend: "Valorant till 3am, then a late breakfast and anime marathon",
  talkAbout: "One Piece theories and building side projects nobody asked for",
  lookingForText: "Someone to queue ranked with and maybe build a hackathon project",
  favorites: "Jujutsu Kaisen, Valorant, lo-fi playlists",
});
out.push({ email: `demo1@${DOMAIN}`, ...demo });
out.push({
  email: `demo2@${DOMAIN}`,
  ...demo,
  weekend: "Gaming all night with friends, then sleeping till noon and watching anime",
});

writeFileSync(new URL("./seed-profiles.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
rmSync(PROGRESS, { force: true });
console.log(`wrote ${out.length} profiles`);
