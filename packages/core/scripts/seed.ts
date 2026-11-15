// Loads seed-profiles.json into the DB. Embeddings + vibe lines are cached in
// seed-embeddings.json (commit it), so every reseed after the first costs 0 API calls.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { prisma } from "@campus/db";
import { buildChunks, ProfileInput, randomAlias, saveProfile, type ProfileCache } from "../src/index";

const PROFILES = new URL("./seed-profiles.json", import.meta.url);
const CACHE = new URL("./seed-embeddings.json", import.meta.url);
const DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? "iiitr.ac.in";
const THROTTLE_MS = 3000; // ≈ 20 profiles/min ≈ 80 embed requests/min, under the free-tier RPM

type SeedRow = { email: string; alias?: string } & Record<string, unknown>;
type CacheEntry = ProfileCache & { hash: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (!existsSync(PROFILES)) {
    throw new Error("seed-profiles.json not found. Run `npm run generate-seed -w @campus/core` first.");
  }
  const data = JSON.parse(readFileSync(PROFILES, "utf8")) as SeedRow[];
  const cache: Record<string, CacheEntry> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

  let embedded = 0;
  for (const { email, alias, ...rest } of data) {
    const input = ProfileInput.parse(rest);
    const hash = createHash("sha1").update(JSON.stringify(buildChunks(input))).digest("hex");
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, ...randomAlias(), ...(alias ? { alias } : {}) },
    });

    const hit = cache[email]?.hash === hash ? cache[email] : undefined;
    const used = await saveProfile(user.id, input, hit);
    if (!hit) {
      cache[email] = { hash, ...used };
      writeFileSync(CACHE, JSON.stringify(cache)); // save as we go, in case we hit a limit midway
      embedded += 1;
      await sleep(THROTTLE_MS);
    }
    console.log(hit ? "↺ cached  " : "✓ embedded", email);
  }

  // Demo setup: demo2 has already pressed Connect on demo1, so demo1 connecting creates a match.
  const [d1, d2] = await Promise.all(
    [`demo1@${DOMAIN}`, `demo2@${DOMAIN}`].map((email) => prisma.user.findUnique({ where: { email } })),
  );
  if (d1 && d2) {
    await prisma.like.upsert({
      where: { fromUserId_toUserId: { fromUserId: d2.id, toUserId: d1.id } },
      create: { fromUserId: d2.id, toUserId: d1.id, action: "CONNECT" },
      update: { action: "CONNECT" },
    });
    console.log("demo2 → demo1 CONNECT pre-seeded");
  }
  console.log(`seeded ${data.length} profiles (${embedded} newly embedded, ${data.length - embedded} from cache)`);
}

main()
  .catch((error: unknown) => {
    console.error("Seeding failed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
