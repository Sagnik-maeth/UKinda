# 🛠️ CampusMatch: Implementation Guide (Next.js + PostgreSQL + Prisma, Monorepo)

> Companion to `PLAN.md`. **This file replaces the stack in PLAN.md** (FastAPI, Chroma and SQLite → Next.js, Postgres + pgvector and Prisma; local sentence-transformers → **Google Gemini API, free tier**).
> Work top to bottom. Every phase ends with a **🚩 Checkpoint**. Don't move on until it passes.

---

## 0. Final Stack

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | **npm workspaces + Turborepo** | `apps/*` and `packages/*`. One `package-lock.json` at the root. **Always run `npm install` from the root** |
| Web app | **Next.js 16 (App Router) + TypeScript + Tailwind** | API = Route Handlers. Auth guard goes in **`proxy.ts`** (Next 16 renamed `middleware.ts` to `proxy.ts`) |
| DB | **PostgreSQL 16 + pgvector** (Docker image `pgvector/pgvector:pg16`) | Postgres **is** the vector DB. No separate service |
| ORM | **Prisma 6** (pin `prisma@6` and `@prisma/client@6`) | Prisma 7 adds required driver adapters, `prisma.config.ts`, ESM-only output, and manual env loading. Not worth the risk in 3 hours |
| Vector column | `Unsupported("vector(768)")` + raw SQL (`$executeRaw` / `$queryRaw`) | Prisma doesn't natively type vectors, so we use SQL for those two operations only |
| AI SDK | **`@google/genai`** (official Gemini SDK) with a free **Google AI Studio** API key | One SDK for embeddings and text generation. No Hugging Face, no OpenAI |
| Embeddings | **`gemini-embedding-001`**, `outputDimensionality: 768`, `taskType: "SEMANTIC_SIMILARITY"` | 768 keeps storage small and fits pgvector's HNSW index. **Vectors below 3072 dims must be L2-normalized by us** (done in `embed.ts`) |
| Generation (fast) | **`gemini-3.5-flash-lite`** | Profile "vibe" one-liner + icebreakers. Cheap, high-volume, structured JSON output |
| Generation (smart) | **`gemini-3.8-flash`** (fallback `gemini-3.6-flash`) | Only offline: generating the seed profiles before the hackathon |
| Realtime chat | **Socket.IO server** in `apps/realtime` (Node + tsx) | Next.js route handlers can't hold WebSockets. Messages are saved in Postgres through the shared Prisma package |
| Auth | Campus email + demo OTP → **JWT in an httpOnly cookie** (`jose`) | The same secret is verified by the realtime server |
| Validation | **zod** schemas shared between client and server | |

### Where Gemini is used (and what it costs in free quota)

| Feature | Model | Calls | When |
|---|---|---|---|
| Profile facet embeddings | `gemini-embedding-001` | 1 batched call (counts as about 4 requests) | Each profile save |
| Card "vibe" one-liner | `gemini-3.5-flash-lite` | 1 | Each profile save (optional, falls back to none) |
| Icebreakers | `gemini-3.5-flash-lite` | 1 | Once per **new match**, stored in the DB (falls back to templates) |
| Seed profile generation | `gemini-3.8-flash` | 6 | Once, before the hackathon |
| Match feed | none | 0 | Pure pgvector SQL: fast and free |
| Chat | none | 0 | Messages never go to Gemini |

Rule of thumb: **one new user costs about 5 requests, one match costs 1, browsing costs 0.** The seed embeddings are cached in a committed JSON file, so reseeding is free.

---

## 1. Monorepo Layout

```
campus-match/
├── PLAN.md
├── IMPLEMENTATION.md          ← this file
├── docker-compose.yml         # postgres + pgvector
├── .env                       # single source, symlinked into apps/packages
├── package.json               # root scripts + "workspaces"
├── package-lock.json          # the ONLY lockfile
├── turbo.json
├── apps/
│   ├── web/                   # Next.js 16
│   │   ├── next.config.ts
│   │   ├── proxy.ts           # auth guard
│   │   └── app/
│   │       ├── login/page.tsx
│   │       ├── onboarding/page.tsx
│   │       ├── matches/page.tsx
│   │       ├── chats/page.tsx
│   │       ├── chats/[matchId]/page.tsx
│   │       └── api/
│   │           ├── auth/login/route.ts
│   │           ├── auth/logout/route.ts
│   │           ├── auth/realtime-token/route.ts
│   │           ├── me/route.ts
│   │           ├── profile/route.ts
│   │           ├── matches/recommendations/route.ts
│   │           ├── connect/route.ts
│   │           ├── chats/route.ts
│   │           └── chats/[matchId]/messages/route.ts
│   └── realtime/              # Socket.IO server on :4000
│       └── src/index.ts
└── packages/
    ├── db/                    # @campus/db: Prisma schema, client, vector SQL helpers
    │   ├── prisma/schema.prisma
    │   └── src/{index.ts, vectors.ts}
    └── core/                  # @campus/core: domain logic shared by web + realtime + seed
        ├── src/
        │   ├── constants.ts   # tag lists, facet weights, slider labels
        │   ├── schemas.ts     # zod ProfileInput
        │   ├── aliases.ts     # "Curious Otter 🦦"
        │   ├── auth.ts        # signSession / verifySession (jose)
        │   ├── chunks.ts      # profile → 4 facet texts
        │   ├── gemini.ts      # GoogleGenAI client + model ids + retry on 429
        │   ├── embed.ts       # gemini-embedding-001 → normalized 768-dim vectors
        │   ├── ai.ts          # vibe line + icebreakers (gemini-3.5-flash-lite)
        │   ├── profile.ts     # saveProfile(): DB + chunks + embeddings
        │   ├── matching.ts    # getRecommendations(): SQL + hybrid score + reasons
        │   └── index.ts
        └── scripts/
            ├── check-gemini.ts    # verifies the API key + both models
            ├── generate-seed.ts   # (run once, before the hackathon) writes seed-profiles.json
            ├── seed.ts            # loads profiles, embeds with caching
            ├── seed-profiles.json
            └── seed-embeddings.json  # cache, so re-seeding costs 0 API calls
```

**Ownership (3 people):**
- **A (Infra/Backend):** db, auth, connect, realtime server
- **B (AI/Matching):** `packages/core` embed, chunks, matching, seed
- **C (Frontend):** all pages and components

With 4 people, D takes the realtime server and chat UI.

---

## 2. Time Plan with Checkpoints

| Clock | Phase | Owner | 🚩 Checkpoint |
|---|---|---|---|
| **Before start** | Phase 0: prep | All | Docker, Node ≥ 20.9 and npm ≥ 10 installed. Gemini keys work. Seed profiles generated |
| 0:00–0:20 | Phase 1: scaffold the monorepo | A (C helps with Next) | **CP1** `npm run dev` runs web on :3000 + realtime on :4000 |
| 0:20–0:40 | Phase 2: DB + Prisma + pgvector | A | **CP2** migration applied, HNSW index exists |
| 0:20–0:50 | Phase 3: core (embed, chunks, aliases) | B | **CP3** `npm run check-gemini` prints `dim = 768, norm ≈ 1` and a test vibe line |
| 0:40–1:00 | Phase 4: auth + proxy | A | **CP4** login sets a cookie, `/api/me` works, `/matches` redirects when logged out |
| 0:20–1:10 | Phase 5: UI (login, onboarding) | C | **CP5** onboarding submits to `PUT /api/profile` and rows + vectors land in the DB |
| 0:50–1:20 | Phase 6: seed + matching | B | **CP6** 🎯 `/api/matches/recommendations` returns sensible top-10 |
| 1:10–1:40 | Phase 7: match feed + connect | C + A | **CP7** two browsers connect, and "It's a match!" appears |
| 1:20–2:15 | Phase 8: realtime chat | A (+C for UI) | **CP8** 🎯 live chat between two browsers, history survives a refresh |
| 2:15–2:35 | Phase 9: safety + polish | All | **CP9** privacy checklist passes. Feature freeze ❄️ |
| 2:35–3:00 | Phase 10: demo prep | All | Two full rehearsals + a recorded backup video |

**If you fall behind:** cut in this order: typing indicator → AI icebreakers (keep template ones) → vibe line → block → fancy UI. **Never cut** the seed, matching or chat.

---

## Phase 0: Prep (do before the timer starts)

```bash
node -v          # ≥ 20.9 (Next 16 requirement)
npm -v           # ≥ 10 (ships with Node 20+)
docker -v
docker pull pgvector/pgvector:pg16
```
- [ ] Create the GitHub repo and add everyone
- [ ] Decide who is A, B and C
- [ ] Pre-generate `seed-profiles.json` (about 40 profiles, see Phase 6) with an LLM *now*
- [ ] **Gemini API keys:** go to Google AI Studio → *Get API key* → create a key. No billing account is needed for the free tier
  - Rate limits apply **per Google Cloud project, not per key**. Each teammate should create their **own project + key** for development, and keep **one separate project's key just for the demo** so dev testing can't burn the demo quota
  - Open the *Rate limits* page in AI Studio and note your real limits for `gemini-embedding-001` and `gemini-3.5-flash-lite`. Third-party trackers report about **100 RPM / 30K TPM / 1,000 RPD** for embeddings on the free tier, but Google only shows exact numbers in AI Studio
  - Free-tier prompts may be used by Google to improve products and seen by human reviewers. We only ever send profile text: **never emails, real names or chat messages** (see Phase 9)
- [ ] Run `npm run generate-seed -w @campus/core` (Phase 6.1) **before** the timer starts and commit `seed-profiles.json`. It uses `gemini-3.8-flash`
- [ ] After Phase 3 exists, run `npm run check-gemini` on every laptop

---

## Phase 1: Scaffold the Monorepo (A, 20 min)

```bash
mkdir campus-match && cd campus-match && git init
npm init -y
mkdir -p apps packages/db/src packages/core/src packages/core/scripts apps/realtime/src
npx create-next-app@latest apps/web --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*" --use-npm --skip-install
```
> `--skip-install` matters. Otherwise create-next-app makes its own `apps/web/node_modules` and `apps/web/package-lock.json`. If that already happened, delete both and reinstall from the root.

**Root `package.json`**
```json
{
  "name": "campus-match",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "db:up": "docker compose up -d",
    "db:migrate": "npm run migrate -w @campus/db",
    "db:generate": "npm run db:generate -w @campus/db",
    "db:studio": "npm run studio -w @campus/db",
    "db:reset": "npm exec -w @campus/db -- prisma migrate reset --force",
    "seed": "npm run seed -w @campus/core",
    "check-gemini": "npm run check-gemini -w @campus/core"
  },
  "devDependencies": { "turbo": "^2", "typescript": "^5.6", "tsx": "^4" },
  "packageManager": "npm@10.9.0"
}
```

**`turbo.json`**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev":   { "cache": false, "persistent": true, "dependsOn": ["^db:generate"] },
    "build": { "dependsOn": ["^build", "^db:generate"], "outputs": [".next/**", "!.next/cache/**"] },
    "db:generate": { "cache": false }
  }
}
```

**`docker-compose.yml`**
```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: campus
      POSTGRES_PASSWORD: campus
      POSTGRES_DB: campusmatch
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
volumes: { pgdata: {} }
```

**`.env`** (root). Symlink it so every package reads the same file:
```bash
DATABASE_URL="postgresql://campus:campus@localhost:5432/campusmatch"
JWT_SECRET="change-me-to-a-long-random-string-32chars+"
ALLOWED_EMAIL_DOMAIN="iiitr.ac.in"
DEMO_OTP="123456"
NEXT_PUBLIC_REALTIME_URL="http://localhost:4000"
WEB_ORIGIN="http://localhost:3000"
GEMINI_API_KEY="your-ai-studio-key"   # each dev uses their own project; swap to the demo key before presenting
GEMINI_EMBED_MODEL="gemini-embedding-001"
GEMINI_FAST_MODEL="gemini-3.5-flash-lite"
GEMINI_SMART_MODEL="gemini-3.8-flash"  # fallback: gemini-3.6-flash
EMBED_DIM="768"
```
```bash
ln -s ../../.env apps/web/.env
ln -s ../../.env apps/realtime/.env
ln -s ../../.env packages/db/.env
ln -s ../../.env packages/core/.env
echo ".env" >> .gitignore   # commit a .env.example instead
```
(Windows teammates: copy the file instead of symlinking.)

**`packages/db/package.json`**
```json
{
  "name": "@campus/db",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "db:generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "studio": "prisma studio"
  },
  "dependencies": { "@prisma/client": "^6" },
  "devDependencies": { "prisma": "^6" }
}
```

**`packages/core/package.json`**
```json
{
  "name": "@campus/core",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "check-gemini": "tsx --env-file=.env scripts/check-gemini.ts",
    "generate-seed": "tsx --env-file=.env scripts/generate-seed.ts",
    "seed": "tsx --env-file=.env scripts/seed.ts"
  },
  "dependencies": {
    "@campus/db": "*",
    "@google/genai": "^1",
    "jose": "^5",
    "zod": "^3"
  }
}
```

**`apps/realtime/package.json`**
```json
{
  "name": "@campus/realtime",
  "private": true,
  "type": "module",
  "scripts": { "dev": "tsx watch --env-file=.env src/index.ts" },
  "dependencies": {
    "@campus/core": "*",
    "@campus/db": "*",
    "socket.io": "^4"
  }
}
```

**`apps/web/package.json`**: create-next-app names the package `web`. Add the workspace packages by hand (npm has no `workspace:` protocol; `"*"` links the local package):
```json
"dependencies": {
  "@campus/core": "*",
  "@campus/db": "*",
  ...
}
```
Then, from the root:
```bash
npm install socket.io-client zod jose -w web
```

**`apps/web/next.config.ts`**
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  transpilePackages: ["@campus/core", "@campus/db"],
  // no native ML packages any more: Gemini is just HTTPS calls
};
export default nextConfig;
```

Placeholder `apps/realtime/src/index.ts`: `console.log("realtime up")` plus an HTTP server on 4000 (it gets replaced in Phase 8).

```bash
npm install && npm run db:up && npm run db:generate && npm run dev
```

### 🚩 CP1
- [ ] `http://localhost:3000` shows the Next page
- [ ] The terminal shows the realtime server on :4000
- [ ] `docker ps` shows the db container

---

## Phase 2: Database Schema + pgvector (A, 20 min)

**`packages/db/prisma/schema.prisma`**
```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

enum Facet { PERSONALITY INTERESTS LIFESTYLE INTENT }
enum LikeAction { CONNECT SKIP }

model User {
  id          String   @id @default(cuid())
  email       String   @unique
  realName    String?
  alias       String
  avatarEmoji String
  year        Int?
  branch      String?
  onboarded   Boolean  @default(false)
  createdAt   DateTime @default(now())

  profile      Profile?
  chunks       ProfileChunk[]
  likesGiven   Like[]    @relation("likesGiven")
  likesGot     Like[]    @relation("likesGot")
  matchesA     Match[]   @relation("matchA")
  matchesB     Match[]   @relation("matchB")
  messages     Message[]
  blocksMade   Block[]   @relation("blocker")
  blocksGot    Block[]   @relation("blocked")
}

model Profile {
  userId           String   @id
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  sliders          Int[]    // 6 values, 1..5
  tags             String[]
  lookingFor       String[]
  availability     String[]
  weekend          String
  talkAbout        String
  lookingForText   String
  unpopularOpinion String?
  favorites        String?
  vibe             String?  // one-line AI summary shown on match cards (gemini-3.5-flash-lite)
  updatedAt        DateTime @updatedAt
}

model ProfileChunk {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  facet     Facet
  content   String
  embedding Unsupported("vector(768)")?
  updatedAt DateTime @updatedAt

  @@unique([userId, facet])
  @@index([facet])
}

model Like {
  id         String     @id @default(cuid())
  fromUserId String
  toUserId   String
  action     LikeAction
  createdAt  DateTime   @default(now())
  from       User       @relation("likesGiven", fields: [fromUserId], references: [id], onDelete: Cascade)
  to         User       @relation("likesGot",   fields: [toUserId],   references: [id], onDelete: Cascade)

  @@unique([fromUserId, toUserId])
}

model Match {
  id         String    @id @default(cuid())
  userAId    String    // always the lexicographically smaller id
  userBId    String
  revealedA  Boolean   @default(false)
  revealedB  Boolean   @default(false)
  icebreakers String[] // generated once by Gemini when the match is created
  createdAt  DateTime  @default(now())
  userA      User      @relation("matchA", fields: [userAId], references: [id], onDelete: Cascade)
  userB      User      @relation("matchB", fields: [userBId], references: [id], onDelete: Cascade)
  messages   Message[]

  @@unique([userAId, userBId])
}

model Message {
  id        String   @id @default(cuid())
  matchId   String
  senderId  String
  text      String
  createdAt DateTime @default(now())
  match     Match    @relation(fields: [matchId], references: [id], onDelete: Cascade)
  sender    User     @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@index([matchId, createdAt])
}

model Block {
  id        String @id @default(cuid())
  blockerId String
  blockedId String
  blocker   User   @relation("blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked   User   @relation("blocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@unique([blockerId, blockedId])
}
```

**Migration with a vector index.** Create the migration without applying it, add the HNSW index by hand, then apply:
```bash
cd packages/db
npx prisma migrate dev --name init --create-only
```
Append this to the generated `prisma/migrations/<ts>_init/migration.sql`:
```sql
CREATE INDEX IF NOT EXISTS profile_chunk_embedding_hnsw
  ON "ProfileChunk" USING hnsw (embedding vector_cosine_ops);
```
Then:
```bash
npx prisma migrate dev     # applies it
npx prisma generate
```

**`packages/db/src/index.ts`**
```ts
import { PrismaClient } from "@prisma/client";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
export * from "@prisma/client";
export * from "./vectors";
```

**`packages/db/src/vectors.ts`**: the only raw SQL in the project:
```ts
import { prisma } from "./index";
import type { Facet } from "@prisma/client";

const toVec = (v: number[]) => `[${v.join(",")}]`;

export async function setChunkEmbedding(userId: string, facet: Facet, embedding: number[]) {
  await prisma.$executeRaw`
    UPDATE "ProfileChunk"
    SET embedding = ${toVec(embedding)}::vector
    WHERE "userId" = ${userId} AND facet = ${facet}::"Facet"`;
}

export type SemanticRow = {
  userId: string;
  semantic: number;                    // weighted sum, 0..1
  facets: Record<string, number>;      // per-facet cosine similarity
};

/** Compare MY 4 facet vectors against everyone else's, facet-to-facet. */
export async function semanticCandidates(userId: string, limit = 50): Promise<SemanticRow[]> {
  return prisma.$queryRaw<SemanticRow[]>`
    WITH me AS (
      SELECT facet, embedding FROM "ProfileChunk"
      WHERE "userId" = ${userId} AND embedding IS NOT NULL
    ),
    weights(facet, w) AS (
      VALUES ('PERSONALITY', 0.30), ('INTERESTS', 0.40), ('LIFESTYLE', 0.15), ('INTENT', 0.15)
    ),
    excluded AS (
      SELECT "toUserId"  AS id FROM "Like"  WHERE "fromUserId" = ${userId}
      UNION SELECT "blockedId" FROM "Block" WHERE "blockerId"  = ${userId}
      UNION SELECT "blockerId" FROM "Block" WHERE "blockedId"  = ${userId}
    )
    SELECT o."userId",
           SUM(w.w * (1 - (o.embedding <=> me.embedding)))::float8              AS semantic,
           json_object_agg(o.facet, 1 - (o.embedding <=> me.embedding))         AS facets
    FROM me
    JOIN "ProfileChunk" o ON o.facet = me.facet AND o."userId" <> ${userId}
    JOIN weights w        ON w.facet = me.facet::text
    WHERE o.embedding IS NOT NULL
      AND o."userId" NOT IN (SELECT id FROM excluded)
    GROUP BY o."userId"
    ORDER BY semantic DESC
    LIMIT ${limit}`;
}
```
> This query scans all chunks (no ANN), which is fine for a campus-sized dataset (thousands of users) and gives an exact facet-to-facet comparison. The HNSW index is there for later, when you switch to per-facet `ORDER BY embedding <=> $q LIMIT k` queries at scale.

### 🚩 CP2
- [ ] `npm run db:studio` shows all 7 tables
- [ ] `docker exec -it <db> psql -U campus -d campusmatch -c "\d \"ProfileChunk\""` shows `embedding vector(768)` and the HNSW index

---

## Phase 3: Core Domain Package (B, 30 min)

**`packages/core/src/constants.ts`**
```ts
export const TAG_GROUPS = {
  Tech: ["coding", "competitive programming", "AI/ML", "web dev", "open source", "cybersecurity", "hackathons"],
  Creative: ["playing music", "singing", "drawing", "photography", "writing", "content creation", "dance"],
  Sports: ["cricket", "football", "badminton", "gym", "running", "yoga", "chess"],
  Entertainment: ["anime", "K-drama", "movies", "web series", "PC gaming", "mobile gaming", "memes"],
  Lifestyle: ["food & cafés", "travel", "reading", "startups", "investing", "volunteering", "spirituality"],
} as const;

export const LOOKING_FOR = ["study buddy", "gym buddy", "gaming squad", "hangout friends", "deep talks", "project/hackathon teammate"] as const;
export const AVAILABILITY = ["mornings", "afternoons", "evenings", "late night", "weekends"] as const;

// [lowLabel, highLabel] for value 1..5
export const SLIDERS = [
  ["very introverted", "very extroverted"],
  ["a strict planner", "totally spontaneous"],
  ["into light banter", "into deep conversations"],
  ["a comfort-zone person", "always trying new things"],
  ["super chill", "very competitive"],
  ["an early bird", "a night owl"],
] as const;

export const FACET_WEIGHTS = { PERSONALITY: 0.3, INTERESTS: 0.4, LIFESTYLE: 0.15, INTENT: 0.15 } as const;
```

**`packages/core/src/schemas.ts`**
```ts
import { z } from "zod";
export const ProfileInput = z.object({
  year: z.number().int().min(1).max(6),
  branch: z.string().max(40).optional(),
  sliders: z.array(z.number().int().min(1).max(5)).length(6),
  tags: z.array(z.string()).min(3).max(10),
  lookingFor: z.array(z.string()).min(1),
  availability: z.array(z.string()).min(1),
  weekend: z.string().min(10).max(300),
  talkAbout: z.string().min(5).max(300),
  lookingForText: z.string().min(5).max(300),
  unpopularOpinion: z.string().max(200).optional(),
  favorites: z.string().max(200).optional(),
});
export type ProfileInput = z.infer<typeof ProfileInput>;
```

**`packages/core/src/aliases.ts`**
```ts
const ADJ = ["Curious", "Sleepy", "Chaotic", "Cosmic", "Witty", "Gentle", "Midnight", "Sunny", "Lowkey", "Electric"];
const ANIMALS: [string, string][] = [["Otter","🦦"],["Panda","🐼"],["Fox","🦊"],["Owl","🦉"],["Koala","🐨"],["Penguin","🐧"],["Tiger","🐯"],["Dolphin","🐬"],["Sloth","🦥"],["Raccoon","🦝"]];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export function randomAlias() {
  const [animal, emoji] = pick(ANIMALS);
  return { alias: `${pick(ADJ)} ${animal}`, avatarEmoji: emoji };
}
```

**`packages/core/src/auth.ts`**
```ts
import { SignJWT, jwtVerify } from "jose";
const key = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export async function signSession(userId: string, ttl = "7d") {
  return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" })
    .setIssuedAt().setExpirationTime(ttl).sign(key());
}
export async function verifySession(token: string) {
  const { payload } = await jwtVerify(token, key());
  return { userId: payload.sub as string };
}
export const SESSION_COOKIE = "cm_session";
```

**`packages/core/src/gemini.ts`**: one client, model ids, and retry for rate limits:
```ts
import { GoogleGenAI } from "@google/genai";

const g = globalThis as unknown as { __genai?: GoogleGenAI };
export const ai = () => (g.__genai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

export const MODELS = {
  embed: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",
  fast:  process.env.GEMINI_FAST_MODEL  ?? "gemini-3.5-flash-lite",
  smart: process.env.GEMINI_SMART_MODEL ?? "gemini-3.8-flash",
};
export const EMBED_DIM = Number(process.env.EMBED_DIM ?? 768);

/** Retries 429 (rate limit) and 5xx with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e: any) {
      const status = Number(e?.status ?? e?.code ?? e?.error?.code);
      if (i >= tries - 1 || ![429, 500, 503].includes(status)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i + Math.random() * 300));
    }
  }
}
```

**`packages/core/src/embed.ts`**
```ts
import { ai, MODELS, EMBED_DIM, withRetry } from "./gemini";

// gemini-embedding-001 only returns unit-length vectors at 3072 dims.
// At 768 we MUST normalize ourselves, or cosine/dot scores are off.
const normalize = (v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
};

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await withRetry(() =>
    ai().models.embedContent({
      model: MODELS.embed,
      contents: texts,                       // batch: all 4 facets in one call
      config: {
        taskType: "SEMANTIC_SIMILARITY",     // profile ↔ profile is symmetric, not query ↔ document
        outputDimensionality: EMBED_DIM,
      },
    }),
  );
  const out = (res.embeddings ?? []).map((e) => normalize(e.values ?? []));
  if (out.length !== texts.length || out[0]?.length !== EMBED_DIM)
    throw new Error(`Bad embedding response (${out.length} vectors, dim ${out[0]?.length})`);
  return out;
}
```
> Why `SEMANTIC_SIMILARITY`? We compare a profile with other profiles of the same shape, so both sides are embedded the same way. Use the same task type everywhere: **vectors made with different task types shouldn't be compared.**
> A batched call with 4 texts may count as **4 requests** against the embedding RPM. Plan quota as "4 per profile save".

**`packages/core/src/ai.ts`**: the text-generation features (all optional; they fall back to templates):
```ts
import { Type } from "@google/genai";
import { ai, MODELS, withRetry } from "./gemini";

type Lite = { tags: string[]; weekend: string; talkAbout: string; lookingFor: string[] };

const describe = (p: Lite) =>
  `Interests: ${p.tags.join(", ")}. Perfect weekend: ${p.weekend}. Could talk for hours about: ${p.talkAbout}. Looking for: ${p.lookingFor.join(", ")}.`;

/** One-line card summary. Returns null on any failure: never blocks onboarding. */
export async function generateVibe(p: Lite): Promise<string | null> {
  try {
    const res = await withRetry(() => ai().models.generateContent({
      model: MODELS.fast,
      contents:
        "Write ONE playful line (max 14 words, at most 1 emoji, no names, nothing that could identify the person) " +
        "capturing this college student's vibe for an anonymous friend-matching card. Output only the line.\n\n" + describe(p),
    }), 2);
    return res.text?.trim().replace(/^["']|["']$/g, "").slice(0, 120) || null;
  } catch { return null; }
}

export function templateIcebreakers(a: Lite, b: Lite): string[] {
  const shared = a.tags.filter((t) => b.tags.includes(t));
  return [
    shared[0] ? `Okay, ${shared[0]} fan: what got you into it?` : "What does your perfect weekend look like?",
    shared[1] ? `Hot take time: best thing about ${shared[1]}?` : "What's something you could talk about for hours?",
    "Quick one: night owl or early bird? 🦉🐦",
  ];
}

/** 3 opening lines, generated ONCE when a match is created and stored on Match.icebreakers. */
export async function generateIcebreakers(a: Lite, b: Lite): Promise<string[]> {
  try {
    const res = await withRetry(() => ai().models.generateContent({
      model: MODELS.fast,
      contents:
        "Two college students just matched on an anonymous campus friend app. Write 3 short, friendly, specific " +
        "opening messages (max 18 words each) either could send, based on what they have in common. " +
        "Not flirty, no names, no personal details.\n\n" +
        `Person A: ${describe(a)}\nPerson B: ${describe(b)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    }), 2);
    const arr = JSON.parse(res.text ?? "[]");
    if (Array.isArray(arr) && arr.length) return arr.slice(0, 3).map((x) => String(x).slice(0, 160));
  } catch { /* fall through */ }
  return templateIcebreakers(a, b);
}
```

**`packages/core/src/chunks.ts`**: facet chunking (one chunk per facet, not split by length):
```ts
import { SLIDERS } from "./constants";
import type { ProfileInput } from "./schemas";

function slidersToText(s: number[]) {
  return s.map((v, i) => {
    const [lo, hi] = SLIDERS[i];
    if (v <= 2) return `${v === 1 ? "very much" : "fairly"} ${lo.replace(/^very /, "")}`;
    if (v >= 4) return `${v === 5 ? "very much" : "fairly"} ${hi.replace(/^very /, "")}`;
    return `balanced between ${lo} and ${hi}`;
  }).join(", ");
}

export function buildChunks(p: ProfileInput) {
  return {
    PERSONALITY: `My personality: I'm ${slidersToText(p.sliders)}.${p.unpopularOpinion ? ` My unpopular opinion: ${p.unpopularOpinion}` : ""}`,
    INTERESTS:   `My interests are ${p.tags.join(", ")}. I could talk for hours about ${p.talkAbout}.${p.favorites ? ` Currently into ${p.favorites}.` : ""}`,
    LIFESTYLE:   `My perfect weekend: ${p.weekend}. I'm usually free in the ${p.availability.join(", ")}.`,
    INTENT:      `I'm looking for: ${p.lookingFor.join(", ")}. ${p.lookingForText}`,
  } as const;
}
```

**`packages/core/src/profile.ts`**: save → chunk → embed → store:
```ts
import { prisma, setChunkEmbedding, type Facet } from "@campus/db";
import { buildChunks } from "./chunks";
import { embed } from "./embed";
import { generateVibe } from "./ai";
import type { ProfileInput } from "./schemas";

type Cached = { vectors: number[][]; vibe: string | null };

/** Saves the profile, embeds 4 facet chunks with Gemini, and stores the vectors.
 *  `cached` lets the seed script skip API calls entirely. Returns what it used, for caching. */
export async function saveProfile(userId: string, p: ProfileInput, cached?: Cached): Promise<Cached> {
  const chunks = buildChunks(p);
  const facets = Object.keys(chunks) as Facet[];

  // embedding + vibe run in parallel (2 API calls; vibe failure is ignored)
  const [vectors, vibe] = cached
    ? [cached.vectors, cached.vibe]
    : await Promise.all([embed(facets.map((f) => chunks[f])), generateVibe(p)]);

  const { year, branch, ...rest } = p;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { year, branch, onboarded: true } }),
    prisma.profile.upsert({ where: { userId }, create: { userId, ...rest, vibe }, update: { ...rest, vibe } }),
  ]);

  for (let i = 0; i < facets.length; i++) {
    const facet = facets[i];
    await prisma.profileChunk.upsert({
      where: { userId_facet: { userId, facet } },
      create: { userId, facet, content: chunks[facet] },
      update: { content: chunks[facet] },
    });
    await setChunkEmbedding(userId, facet, vectors[i]);
  }
  return { vectors, vibe };
}
```
> Embeddings run **before** anything is written. If Gemini fails (quota, network), the request errors and the user just presses Submit again: no half-saved profile.

**`packages/core/scripts/check-gemini.ts`**
```ts
import { embed, generateVibe } from "../src";

const [a, b, c] = await embed([
  "I love anime and late-night gaming sessions",
  "Big manga fan, I play games till 3am",
  "I wake up at 5 for the gym and protein shakes",
]);
const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
console.log("dim =", a.length, "| norm ≈", Math.sqrt(dot(a, a)).toFixed(3));
console.log("similar pair  :", dot(a, b).toFixed(3));   // should be clearly higher…
console.log("different pair:", dot(a, c).toFixed(3));   // …than this
console.log("vibe:", await generateVibe({
  tags: ["anime", "PC gaming"], weekend: "gaming marathon then biryani",
  talkAbout: "One Piece theories", lookingFor: ["gaming squad"],
}));
```

**`packages/core/src/index.ts`**: re-export everything (`constants`, `schemas`, `aliases`, `auth`, `gemini`, `chunks`, `embed`, `ai`, `profile`, `matching`).

### 🚩 CP3
- [ ] `npm run check-gemini` prints `dim = 768 | norm ≈ 1.000`, the similar pair scores clearly above the different pair, and a vibe line prints
- [ ] Note the two similarity numbers: you'll use them to calibrate the match % in Phase 6
- [ ] `buildChunks(sample)` prints 4 readable sentences

---

## Phase 4: Auth + Route Protection (A, 20 min)

**`apps/web/app/api/auth/login/route.ts`**
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@campus/db";
import { randomAlias, signSession, SESSION_COOKIE } from "@campus/core";

const Body = z.object({ email: z.string().email(), otp: z.string() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const email = parsed.data.email.toLowerCase().trim();

  if (!email.endsWith("@" + process.env.ALLOWED_EMAIL_DOMAIN))
    return NextResponse.json({ error: "Use your campus email" }, { status: 403 });
  if (parsed.data.otp !== process.env.DEMO_OTP)
    return NextResponse.json({ error: "Wrong code" }, { status: 401 });

  const user = await prisma.user.upsert({
    where: { email }, update: {}, create: { email, ...randomAlias() },
  });

  const res = NextResponse.json({ onboarded: user.onboarded });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
```

**`apps/web/lib/session.ts`**: helper for route handlers and server components:
```ts
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@campus/core";

export async function requireUserId(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Response("Unauthorized", { status: 401 });
  try { return (await verifySession(token)).userId; }
  catch { throw new Response("Unauthorized", { status: 401 }); }
}
```
(In route handlers, wrap the body in `try { … } catch (e) { if (e instanceof Response) return e; throw e; }`.)

**`apps/web/app/api/me/route.ts`**: return only safe fields:
```ts
const u = await prisma.user.findUnique({ where: { id }, select: { id: true, alias: true, avatarEmoji: true, year: true, onboarded: true } });
```

**`apps/web/app/api/auth/realtime-token/route.ts`**: short-lived token for Socket.IO (the session cookie is httpOnly, so JS can't read it):
```ts
const userId = await requireUserId();
return NextResponse.json({ token: await signSession(userId, "10m") });
```

**`apps/web/app/api/auth/logout/route.ts`**: delete the cookie.

**`apps/web/proxy.ts`** (Next 16: the file is `proxy.ts` and the export is `proxy`. It runs on the Node runtime.)
```ts
import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@campus/core";

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = token ? await verifySession(token).then(() => true).catch(() => false) : false;
  if (!ok) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/onboarding", "/matches/:path*", "/chats/:path*"] };
```
> If `proxy.ts` causes an import issue with the workspace package, inline the `jwtVerify` from `jose` directly in this file. The proxy is only a convenience check, because every API route verifies again anyway.

### 🚩 CP4
```bash
curl -i -X POST localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"test@iiitr.ac.in","otp":"123456"}'          # → 200 + Set-Cookie
curl -i -X POST localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"x@gmail.com","otp":"123456"}'               # → 403
```
- [ ] Visiting `/matches` in a fresh incognito window redirects to `/login`

---

## Phase 5: Login + Onboarding UI + Profile API (C, with B's `saveProfile`, 50 min)

**`apps/web/app/api/profile/route.ts`**
```ts
import { NextResponse } from "next/server";
import { ProfileInput, saveProfile } from "@campus/core";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";
export const runtime = "nodejs";

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const parsed = ProfileInput.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    await saveProfile(userId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) { if (e instanceof Response) return e; throw e; }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await prisma.profile.findUnique({ where: { userId } }));
  } catch (e) { if (e instanceof Response) return e; throw e; }
}
```

**Pages (client components, Tailwind):**
1. **`/login`**: email field + OTP field (with the hint "demo code: 123456"). On success, go to `/onboarding` if not onboarded, else `/matches`.
2. **`/onboarding`**: a 4-step wizard with a progress bar:
   - **Step 1 "Vibe check":** 6 sliders (labels from `SLIDERS`) + year select
   - **Step 2 "Interests":** chip picker grouped by `TAG_GROUPS` (min 3, max 10)
   - **Step 3 "Tell us more":** `weekend`, `talkAbout`, `unpopularOpinion?`, `favorites?` textareas, with placeholder examples
   - **Step 4 "Looking for":** `LOOKING_FOR` chips + `lookingForText` + `AVAILABILITY` chips
   - Submit → `PUT /api/profile` → show a spinner ("Finding your people… ✨") → go to `/matches`
3. Show the user's alias + emoji at the top ("You are **Sleepy Panda 🐼**").

Components: `Slider`, `ChipPicker`, `StepShell`, `Button`.

> A profile save makes 2 Gemini calls in parallel (embeddings + vibe) and takes about 1–2 s. On a `PUT /api/profile` error, keep the form state and show "Couldn't save, try again". The free tier occasionally returns 429, and `withRetry` already covers most of those.

### 🚩 CP5
- [ ] Complete onboarding in the browser
- [ ] In Prisma Studio, the `Profile` row exists and 4 `ProfileChunk` rows exist
- [ ] `SELECT facet, vector_dims(embedding) FROM "ProfileChunk";` → 4 rows × 768
- [ ] The `Profile.vibe` column has a one-liner (or null if Gemini failed, which is fine)

---

## Phase 6: Seed Data + Matching Engine (B, 30 min) 🎯

### 6.1 Generate seed profiles with Gemini (run once, BEFORE the hackathon)
About 42 profiles across 6 archetypes (7 each, plus blends), plus **2 demo accounts**:
- 🎮 **Night-owl gamer / anime**
- 🏋️ **Gym and sports**
- 💻 **Hackathon / CP grinder**
- 🎸 **Music / art / creative**
- 📚 **Bookish deep-talker**
- 🍜 **Foodie / traveler / social butterfly**

**`packages/core/scripts/generate-seed.ts`**: uses `gemini-3.8-flash` with structured JSON output, one call per archetype (6 calls total):
```ts
import { writeFileSync } from "node:fs";
import { Type } from "@google/genai";
import { ai, MODELS, withRetry } from "../src/gemini";
import { TAG_GROUPS, LOOKING_FOR, AVAILABILITY } from "../src/constants";
import { ProfileInput } from "../src/schemas";

const ALL_TAGS = Object.values(TAG_GROUPS).flat() as string[];
const ARCHETYPES = [
  "night-owl gamer who loves anime", "gym and sports enthusiast", "hackathon and competitive programming grinder",
  "musician / artist / creative", "bookish deep-talker", "foodie, traveler and social butterfly",
];
const str = { type: Type.STRING };
const profileSchema = {
  type: Type.OBJECT,
  properties: {
    year: { type: Type.INTEGER }, branch: str,
    sliders: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    tags: { type: Type.ARRAY, items: { type: Type.STRING, enum: ALL_TAGS } },
    lookingFor: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...LOOKING_FOR] } },
    availability: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...AVAILABILITY] } },
    weekend: str, talkAbout: str, lookingForText: str, unpopularOpinion: str, favorites: str,
  },
  required: ["year", "sliders", "tags", "lookingFor", "availability", "weekend", "talkAbout", "lookingForText"],
};

const out: any[] = [];
for (const [i, archetype] of ARCHETYPES.entries()) {
  const res = await withRetry(() => ai().models.generateContent({
    model: MODELS.smart,
    contents:
      `Generate 7 distinct profiles of Indian engineering college students (IIIT campus) for an anonymous friend-matching app. ` +
      `Archetype: ${archetype}. Make 2 of them blends with another interest. year is 1-4, sliders is exactly 6 integers 1-5 ` +
      `(introvert→extrovert, planner→spontaneous, light→deep talk, comfort→novelty, chill→competitive, early bird→night owl). ` +
      `tags: 4-8 items. Free text: casual, specific, varied, 1-2 sentences, no real names.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: { type: Type.ARRAY, items: profileSchema },
    },
  }));
  for (const [j, p] of JSON.parse(res.text ?? "[]").entries()) {
    const parsed = ProfileInput.safeParse({ ...p, sliders: p.sliders?.slice(0, 6), tags: p.tags?.slice(0, 10) });
    if (parsed.success) out.push({ email: `seed${String(i * 10 + j).padStart(2, "0")}@iiitr.ac.in`, ...parsed.data });
    else console.warn("skipped invalid profile", parsed.error.issues[0]);
  }
  console.log(`✓ ${archetype}`);
}

// two hand-written demo accounts that should match each other at the top
const demo = {
  year: 2, sliders: [2, 4, 5, 4, 2, 5], tags: ["anime", "PC gaming", "hackathons", "memes", "food & cafés"],
  lookingFor: ["gaming squad", "project/hackathon teammate"], availability: ["late night", "weekends"],
  weekend: "Valorant till 3am, then a late breakfast and anime marathon",
  talkAbout: "One Piece theories and building side projects nobody asked for",
  lookingForText: "Someone to queue ranked with and maybe build a hackathon project",
  favorites: "Jujutsu Kaisen, Valorant, lo-fi playlists",
};
out.push({ email: "demo1@iiitr.ac.in", ...demo });
out.push({ email: "demo2@iiitr.ac.in", ...demo, weekend: "Gaming all night with friends, then sleeping till noon and watching anime" });

writeFileSync(new URL("./seed-profiles.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(`wrote ${out.length} profiles`);
```
```bash
npm run generate-seed -w @campus/core     # about 1 min, 6 requests to gemini-3.8-flash
```
Open `seed-profiles.json`, skim it, fix anything weird by hand, and **commit it**. If `gemini-3.8-flash` hits its free limit, set `GEMINI_SMART_MODEL=gemini-3.6-flash` and rerun.

### 6.2 `packages/core/scripts/seed.ts`: embeds with a cache and a throttle
The first run makes about 44 × (4 embeddings + 1 vibe) requests, paced to stay under the free-tier RPM. It writes `seed-embeddings.json`, so **every later reseed costs 0 API calls**. This matters because you'll reset the DB several times during the day and the daily quota (RPD) is small.
```ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { prisma } from "@campus/db";
import { randomAlias, saveProfile, buildChunks, ProfileInput } from "../src";
import data from "./seed-profiles.json" with { type: "json" };

const CACHE = new URL("./seed-embeddings.json", import.meta.url);
const cache: Record<string, { hash: string; vectors: number[][]; vibe: string | null }> =
  existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const raw of data as any[]) {
  const { email, alias, ...p } = raw;
  const input = ProfileInput.parse(p);
  const hash = createHash("sha1").update(JSON.stringify(buildChunks(input))).digest("hex");
  const user = await prisma.user.upsert({
    where: { email }, update: {},
    create: { email, ...randomAlias(), ...(alias ? { alias } : {}) },
  });

  const hit = cache[email]?.hash === hash ? cache[email] : undefined;
  const used = await saveProfile(user.id, input, hit);
  if (!hit) {
    cache[email] = { hash, ...used };
    writeFileSync(CACHE, JSON.stringify(cache));   // save as we go, in case we hit a limit midway
    await sleep(3000);                              // ≈ 20 profiles/min ≈ 80 embed requests/min
  }
  console.log(hit ? "↺ cached" : "✓ embedded", email);
}

// demo setup: demo2 has already pressed Connect on demo1
const [d1, d2] = await Promise.all(["demo1@iiitr.ac.in", "demo2@iiitr.ac.in"].map((email) => prisma.user.findUnique({ where: { email } })));
if (d1 && d2) await prisma.like.upsert({
  where: { fromUserId_toUserId: { fromUserId: d2.id, toUserId: d1.id } },
  create: { fromUserId: d2.id, toUserId: d1.id, action: "CONNECT" }, update: { action: "CONNECT" },
});
await prisma.$disconnect();
```
```bash
npm run seed      # first run about 2–3 min (throttled), then a few seconds
```
**Commit `seed-embeddings.json` too**, so teammates and the demo machine can seed without using any quota.

### 6.3 `packages/core/src/matching.ts`: hybrid scoring
```ts
import { prisma, semanticCandidates } from "@campus/db";

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (new Set([...a, ...b]).size || 1);
};
// Gemini similarities sit in a narrow, high band (roughly 0.55–0.9). Calibrate LOW/HIGH from
// what check-gemini and CP6 print, so the UI shows a friendly 55–98% spread.
const LOW = 0.55, HIGH = 0.85;
const toPct = (s: number) => Math.round(Math.min(98, Math.max(55, 55 + ((s - LOW) / (HIGH - LOW)) * 43)));
const FACET_REASON: Record<string, string> = {
  PERSONALITY: "similar personalities", INTERESTS: "overlapping interests",
  LIFESTYLE: "similar weekend vibes", INTENT: "want the same kind of friendship",
};

export async function getRecommendations(userId: string, take = 10) {
  const me = await prisma.profile.findUnique({ where: { userId } });
  if (!me) return [];

  const rows = await semanticCandidates(userId, 50);
  const others = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) }, onboarded: true },
    select: { id: true, alias: true, avatarEmoji: true, year: true, profile: { select: { tags: true, lookingFor: true, vibe: true } } },
  });
  const byId = new Map(others.map((o) => [o.id, o]));

  const scored = rows.flatMap((r) => {
    const o = byId.get(r.userId);
    if (!o?.profile) return [];
    const sharedTags = o.profile.tags.filter((t) => me.tags.includes(t));
    const sharedIntent = o.profile.lookingFor.filter((t) => me.lookingFor.includes(t));
    const final =
      0.7 * r.semantic +
      0.2 * jaccard(me.tags, o.profile.tags) +
      0.1 * (sharedIntent.length ? 1 : 0);

    const topFacet = Object.entries(r.facets).sort((a, b) => b[1] - a[1])[0]?.[0];
    const reasons = [
      sharedTags.length ? `You both like ${sharedTags.slice(0, 3).join(", ")}` : null,
      topFacet ? `Strongest link: ${FACET_REASON[topFacet]}` : null,
      sharedIntent.length ? `Both looking for ${sharedIntent[0]}` : null,
    ].filter(Boolean) as string[];

    const icebreaker = sharedTags[0]
      ? `Ask them about their favourite thing in ${sharedTags[0]} 👀`
      : `Ask about their perfect weekend 🌤️`;

    return [{ userId: o.id, alias: o.alias, avatarEmoji: o.avatarEmoji, year: o.year, vibe: o.profile.vibe,
              tags: o.profile.tags, score: toPct(final), raw: final, reasons, icebreaker }];
  });

  scored.sort((a, b) => b.raw - a.raw);
  return scored.slice(0, take);
}
```
> **Cold-start fallback:** if fewer than 5 results come back, top up with random onboarded users (`ORDER BY random()`) that aren't excluded, with a score of about 55% and the reason "New on campus 👋".

**`apps/web/app/api/matches/recommendations/route.ts`**: `requireUserId()` → `getRecommendations(userId)` → JSON. **Never select `email` or `realName`.**

### 🚩 CP6 🎯
- [ ] Log in as `demo1`, then call `GET /api/matches/recommendations`. `demo2` should be in the top 3
- [ ] A gamer seed profile's top results are mostly gamers/anime people (sanity-check 3 archetypes)
- [ ] If results feel off, adjust `FACET_WEIGHTS` and the 0.7/0.2/0.1 split. Don't touch anything else
- [ ] Log `raw` for the top and bottom results, and set `LOW`/`HIGH` in `matching.ts` so the best matches show about 90%+ and weak ones about 60%
- [ ] Cards show the Gemini `vibe` line. **No Gemini calls happen when loading recommendations**: it's pure pgvector + SQL, so the feed is fast and costs no quota

---

## Phase 7: Match Feed + Connect (C + A, 30 min)

**`apps/web/app/api/connect/route.ts`**
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@campus/db";
import { generateIcebreakers } from "@campus/core";
import { requireUserId } from "@/lib/session";

const Body = z.object({ targetId: z.string(), action: z.enum(["CONNECT", "SKIP"]) });

export async function POST(req: Request) {
  try {
    const me = await requireUserId();
    const { targetId, action } = Body.parse(await req.json());
    if (targetId === me) return NextResponse.json({ error: "nope" }, { status: 400 });

    await prisma.like.upsert({
      where: { fromUserId_toUserId: { fromUserId: me, toUserId: targetId } },
      create: { fromUserId: me, toUserId: targetId, action },
      update: { action },
    });
    if (action === "SKIP") return NextResponse.json({ matched: false });

    const back = await prisma.like.findUnique({
      where: { fromUserId_toUserId: { fromUserId: targetId, toUserId: me } },
    });
    if (back?.action !== "CONNECT") return NextResponse.json({ matched: false });

    const [userAId, userBId] = [me, targetId].sort();
    const where = { userAId_userBId: { userAId, userBId } };
    let match = await prisma.match.findUnique({ where });
    if (!match) {
      // 1 Gemini call per NEW match (not per page view), stored forever
      const [pa, pb] = await Promise.all([
        prisma.profile.findUnique({ where: { userId: userAId } }),
        prisma.profile.findUnique({ where: { userId: userBId } }),
      ]);
      const icebreakers = pa && pb ? await generateIcebreakers(pa, pb) : [];
      try {
        match = await prisma.match.create({ data: { userAId, userBId, icebreakers } });
      } catch {
        match = await prisma.match.findUniqueOrThrow({ where });   // both clicked at the same moment
      }
    }
    return NextResponse.json({ matched: true, matchId: match.id });
  } catch (e) { if (e instanceof Response) return e; throw e; }
}
```

**`apps/web/app/api/chats/route.ts`**: my matches with the other person's alias/emoji and last message:
```ts
const matches = await prisma.match.findMany({
  where: { OR: [{ userAId: me }, { userBId: me }] },
  include: {
    userA: { select: { id: true, alias: true, avatarEmoji: true } },
    userB: { select: { id: true, alias: true, avatarEmoji: true } },
    messages: { orderBy: { createdAt: "desc" }, take: 1 },
  },
  orderBy: { createdAt: "desc" },
});
// map to { matchId, other: userA.id === me ? userB : userA, lastMessage }
```

**UI: `/matches`**
- A grid or list of `MatchCard`: big emoji, alias, "2nd year", **match % badge**, the italic Gemini **vibe line**, reason bullets, up to 5 tags
- **Connect 💚 / Skip ✖** buttons. Remove the card optimistically. If `matched: true`, show the **"It's a match! 🎉"** modal with a "Say hi" button that goes to `/chats/{matchId}`
- Empty state: "You've seen everyone for now. Check back later 👀"

**UI: `/chats`**: a list of matches (emoji, alias, last message preview).

**Demo trick:** pre-make `demo2` connect to `demo1` (via the seed or a quick curl), so a live Connect from `demo1` instantly shows the match modal.

### 🚩 CP7
- [ ] Browser A (demo1) and browser B (incognito, demo2) connect to each other, and the match modal appears for the second one
- [ ] Both see the match in `/chats`
- [ ] Skipped people don't come back after a refresh

---

## Phase 8: Realtime Chat (A builds the server, C builds the UI, 55 min) 🎯

**`apps/realtime/src/index.ts`**
```ts
import { createServer } from "node:http";
import { Server } from "socket.io";
import { prisma } from "@campus/db";
import { verifySession } from "@campus/core";

const http = createServer((_, res) => { res.writeHead(200); res.end("ok"); });
const io = new Server(http, { cors: { origin: process.env.WEB_ORIGIN, credentials: true } });

io.use(async (socket, next) => {
  try {
    const { userId } = await verifySession(socket.handshake.auth?.token);
    socket.data.userId = userId;
    next();
  } catch { next(new Error("unauthorized")); }
});

io.on("connection", (socket) => {
  const uid: string = socket.data.userId;

  socket.on("join", async (matchId: string, ack?: (r: { ok: boolean }) => void) => {
    const m = await prisma.match.findFirst({
      where: { id: matchId, OR: [{ userAId: uid }, { userBId: uid }] },
    });
    if (!m) return ack?.({ ok: false });
    // block check: if either user blocked the other, refuse
    const blocked = await prisma.block.findFirst({
      where: { OR: [
        { blockerId: m.userAId, blockedId: m.userBId },
        { blockerId: m.userBId, blockedId: m.userAId },
      ] },
    });
    if (blocked) return ack?.({ ok: false });
    socket.join(matchId);
    ack?.({ ok: true });
  });

  socket.on("message:send", async ({ matchId, text }: { matchId: string; text: string }) => {
    if (!socket.rooms.has(matchId)) return;              // must have joined (membership verified)
    const clean = String(text ?? "").trim().slice(0, 1000);
    if (!clean) return;
    const msg = await prisma.message.create({ data: { matchId, senderId: uid, text: clean } });
    io.to(matchId).emit("message:new", msg);
  });

  socket.on("typing", (matchId: string) => {
    if (socket.rooms.has(matchId)) socket.to(matchId).emit("typing", { matchId });
  });
});

http.listen(4000, () => console.log("realtime on :4000"));
```

**History API: `apps/web/app/api/chats/[matchId]/messages/route.ts`**
- `GET`: verify that I'm `userAId` or `userBId` of the match, else 404. Return `{ messages, icebreakers }`: the last 50 messages ascending (`{ id, senderId, text, createdAt }`) and `match.icebreakers`
- *(Fallback if sockets break during the demo:* a `POST` here that creates a message, plus client polling every 2 s. Build this only if needed.)*

**Client hook: `apps/web/lib/useChat.ts`**
```ts
"use client";
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export type Msg = { id: string; senderId: string; text: string; createdAt: string };

export function useChat(matchId: string) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [icebreakers, setIcebreakers] = useState<string[]>([]);
  const sock = useRef<Socket | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const hist = await fetch(`/api/chats/${matchId}/messages`).then((r) => r.json());
      if (alive) { setMessages(hist.messages); setIcebreakers(hist.icebreakers ?? []); }
      const { token } = await fetch("/api/auth/realtime-token").then((r) => r.json());
      const s = io(process.env.NEXT_PUBLIC_REALTIME_URL!, { auth: { token } });
      sock.current = s;
      s.on("connect", () => s.emit("join", matchId));
      s.on("message:new", (m: Msg) => setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m])));
      s.on("typing", () => { setPeerTyping(true); setTimeout(() => setPeerTyping(false), 1500); });
    })();
    return () => { alive = false; sock.current?.disconnect(); };
  }, [matchId]);

  return {
    messages, peerTyping, icebreakers,
    send: (text: string) => sock.current?.emit("message:send", { matchId, text }),
    typing: () => sock.current?.emit("typing", matchId),
  };
}
```

**UI: `/chats/[matchId]`**
- Header: other person's emoji + alias, plus a "⋯" menu (Block)
- Message list: my bubbles on the right, theirs on the left. Auto-scroll to the bottom
- If there are no messages: show the 3 Gemini **icebreaker chips** (`icebreakers` from the hook). Clicking one fills the input
- Input + Send (Enter to send). Call `typing()` on keypress (throttled)
- Render text as plain text only (no `dangerouslySetInnerHTML`)

### 🚩 CP8 🎯
- [ ] demo1 and demo2 in two browsers: messages appear instantly on both sides
- [ ] Refresh: the history loads from Postgres
- [ ] A third user calling `GET /api/chats/<their matchId>/messages` gets a 404, and their socket `join` gets `ok:false`

---

## Phase 9: Safety + Polish (all, 20 min)

**Block (stretch, but recommended):** `POST /api/block { targetId }` upserts a `Block` row. It is already excluded in `semanticCandidates` and refused at socket `join`. Also filter blocked matches out of `/api/chats`.

### Privacy checklist (run as a team)
- [ ] `grep -rn "email\|realName" apps/web/app/api` → only `auth/login` touches email. No `select` returns it
- [ ] Recommendations, chats, messages and the socket payload contain **no** email/realName
- [ ] Chat history and socket rooms require match membership (CP8 test)
- [ ] Message length is capped at 1000, and empty messages are dropped
- [ ] Non-campus emails are rejected (CP4 test)
- [ ] `.env` is not committed; `.env.example` is committed
- [ ] **Data sent to Gemini is profile text only.** Check `chunks.ts` and `ai.ts`: no email, no realName, no alias, **no chat messages**. On the free tier, Google may use prompts to improve products and humans may review them. Mention this in your privacy note, and say that a paid tier or self-hosted model is the production path
- [ ] `GEMINI_API_KEY` is only used server-side: never in a `NEXT_PUBLIC_*` variable and never imported in a client component

### Polish
- [ ] Loading skeletons on `/matches`, a spinner on onboarding submit
- [ ] Empty states (no matches, no chats)
- [ ] Mobile layout check (most judges will look at a phone-sized window)
- [ ] Bottom nav: Matches · Chats · Me
- [ ] Favicon + app name in `<title>`

### 🚩 CP9: Feature freeze ❄️. From here on, bug fixes only.

---

## Phase 10: Demo Prep (25 min)

- [ ] **Reset script:** `npm run db:reset && npm run seed` (`db:reset` is already in the root scripts). Run it, then pre-create the `demo2 → demo1` connect
- [ ] Switch `GEMINI_API_KEY` to the **demo project's key**, restart, and run `npm run check-gemini` 10 minutes before presenting. Check that AI Studio shows quota left for today
- [ ] Reseed using the committed `seed-embeddings.json` (0 API calls)
- [ ] Two windows side by side: normal (demo1) and incognito (demo2)
- [ ] Rehearse the 2-minute script in `PLAN.md` §12 **twice**
- [ ] Record a screen capture of the full flow as a backup
- [ ] README: what it is, the architecture diagram from PLAN.md, `npm install && npm run db:up && npm run db:migrate && npm run seed && npm run dev`

---

## Troubleshooting (fast fixes)

| Symptom | Fix |
|---|---|
| `type "vector" does not exist` | You're not on the `pgvector/pgvector` image, or the migration lacks `CREATE EXTENSION`. Check that `extensions = [vector]` is in the datasource and re-run `migrate dev` |
| Prisma Studio errors on `embedding` | Expected (Unsupported type). Ignore it and check with psql |
| `operator does not exist: "Facet" = text` | Cast: `facet = ${facet}::"Facet"` or `me.facet::text` (already in the SQL above) |
| `429 RESOURCE_EXHAUSTED` from Gemini | You hit a free-tier limit (RPM, TPM or RPD). `withRetry` handles short bursts. For daily limits, switch to another teammate's project key. Never re-embed seed data: use the cache |
| `400` / `API key not valid` | The key is wrong or missing in the `.env` that process reads. Check the symlinks, and restart `npm run dev` after editing `.env` |
| `expected 768 dimensions, not 3072` from Postgres | `outputDimensionality` didn't reach the API. Check that `EMBED_DIM=768` and that `embed.ts` passes it inside `config` |
| All match % look the same (for example all 95%) | Vectors not normalized, or `LOW`/`HIGH` not calibrated. Rerun `check-gemini` and adjust |
| `models/gemini-3.x… not found` | Model ids change over time. Check the models page in AI Studio, and update `GEMINI_FAST_MODEL` / `GEMINI_SMART_MODEL` in `.env` (no code change needed) |
| Vibe or icebreakers missing | They fail silently by design (null / template fallback). Check the server log for the Gemini error |
| `@prisma/client did not initialize yet` | Run `npm run db:generate` |
| Socket `unauthorized` | `JWT_SECRET` differs between web and realtime. Check that the `.env` symlinks exist |
| Socket CORS error | `WEB_ORIGIN` must exactly equal `http://localhost:3000` |
| `proxy.ts` not running | It must be at the app root (`apps/web/proxy.ts`), export `proxy`, and include a `config.matcher` |
| Same person shows up twice | Unique `(userId, facet)`. Make sure seeding uses `upsert` and doesn't create duplicates |
| Teammate on Windows: symlinks fail | Copy `.env` into each folder |
| `Cannot find module '@campus/core'` | You ran `npm install` inside a sub-folder. Delete every nested `node_modules` and `package-lock.json`, then run `npm install` from the root. Check that `node_modules/@campus/core` is a symlink |
| Two copies of `@prisma/client` / stale client | Only `packages/db` should depend on Prisma. Run `npm run db:generate` after every schema change |
| `npm error No workspaces found` with `-w` | Use the package **name** from its `package.json` (`@campus/db`, `web`), not the folder path, or use the path `-w apps/web` |

---

## Final Definition of Done ✅
- [ ] CP1–CP9 all ticked
- [ ] Fresh clone → README commands → working app in under 5 minutes
- [ ] Demo: onboard → see matches with % and reasons → mutual connect → live chat
- [ ] No PII leaks in any API response
- [ ] Backup video recorded
