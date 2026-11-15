# 🛠️ CampusMatch: Implementation Guide (Next.js + PostgreSQL + Prisma, Monorepo)

> Companion to `PLAN.md`. **This file replaces the stack in PLAN.md** (FastAPI, Chroma and SQLite → Next.js, Postgres + pgvector and Prisma).
> Work top to bottom. Every phase ends with a **🚩 Checkpoint**. Don't move on until it passes.

---

## 0. Final Stack

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | **npm workspaces + Turborepo** | `apps/*` and `packages/*`. One `package-lock.json` at the root. **Always run `npm install` from the root** |
| Web app | **Next.js 16 (App Router) + TypeScript + Tailwind** | API = Route Handlers. Auth guard goes in **`proxy.ts`** (Next 16 renamed `middleware.ts` to `proxy.ts`) |
| DB | **PostgreSQL 16 + pgvector** (Docker image `pgvector/pgvector:pg16`) | Postgres **is** the vector DB. No separate service |
| ORM | **Prisma 6** (pin `prisma@6` and `@prisma/client@6`) | Prisma 7 adds required driver adapters, `prisma.config.ts`, ESM-only output, and manual env loading. Not worth the risk in 3 hours |
| Vector column | `Unsupported("vector(384)")` + raw SQL (`$executeRaw` / `$queryRaw`) | Prisma doesn't natively type vectors, so we use SQL for those two operations only |
| Embeddings | **Transformers.js** (`@huggingface/transformers`) with `Xenova/all-MiniLM-L6-v2` (384-dim), running locally in Node | Fallback: OpenAI `text-embedding-3-small` with `dimensions: 384` (same column, no migration) |
| Realtime chat | **Socket.IO server** in `apps/realtime` (Node + tsx) | Next.js route handlers can't hold WebSockets. Messages are saved in Postgres through the shared Prisma package |
| Auth | Campus email + demo OTP → **JWT in an httpOnly cookie** (`jose`) | The same secret is verified by the realtime server |
| Validation | **zod** schemas shared between client and server | |

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
        │   ├── embed.ts       # Transformers.js singleton
        │   ├── profile.ts     # saveProfile(): DB + chunks + embeddings
        │   ├── matching.ts    # getRecommendations(): SQL + hybrid score + reasons
        │   └── index.ts
        └── scripts/
            ├── warmup.ts      # pre-download the model
            ├── seed.ts
            └── seed-profiles.json
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
| **Before start** | Phase 0: prep | All | Docker, Node ≥ 20.9 and npm ≥ 10 installed. Model cached |
| 0:00–0:20 | Phase 1: scaffold the monorepo | A (C helps with Next) | **CP1** `npm run dev` runs web on :3000 + realtime on :4000 |
| 0:20–0:40 | Phase 2: DB + Prisma + pgvector | A | **CP2** migration applied, HNSW index exists |
| 0:20–0:50 | Phase 3: core (embed, chunks, aliases) | B | **CP3** `embed(["hi"])` returns a 384-length vector |
| 0:40–1:00 | Phase 4: auth + proxy | A | **CP4** login sets a cookie, `/api/me` works, `/matches` redirects when logged out |
| 0:20–1:10 | Phase 5: UI (login, onboarding) | C | **CP5** onboarding submits to `PUT /api/profile` and rows + vectors land in the DB |
| 0:50–1:20 | Phase 6: seed + matching | B | **CP6** 🎯 `/api/matches/recommendations` returns sensible top-10 |
| 1:10–1:40 | Phase 7: match feed + connect | C + A | **CP7** two browsers connect, and "It's a match!" appears |
| 1:20–2:15 | Phase 8: realtime chat | A (+C for UI) | **CP8** 🎯 live chat between two browsers, history survives a refresh |
| 2:15–2:35 | Phase 9: safety + polish | All | **CP9** privacy checklist passes. Feature freeze ❄️ |
| 2:35–3:00 | Phase 10: demo prep | All | Two full rehearsals + a recorded backup video |

**If you fall behind:** cut in this order: typing indicator → icebreakers → block → fancy UI. **Never cut** the seed, matching or chat.

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
- [ ] After Phase 3 exists, run `npm run warmup -w @campus/core` on **every laptop** to cache the model (or right after scaffolding if internet is good)

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
    "warmup": "npm run warmup -w @campus/core"
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
EMBEDDING_PROVIDER="local"     # or "openai"
OPENAI_API_KEY=""
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
    "warmup": "tsx scripts/warmup.ts",
    "seed": "tsx --env-file=.env scripts/seed.ts"
  },
  "dependencies": {
    "@campus/db": "*",
    "@huggingface/transformers": "^3",
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
  // native/onnx deps must not be bundled
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
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
  updatedAt        DateTime @updatedAt
}

model ProfileChunk {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  facet     Facet
  content   String
  embedding Unsupported("vector(384)")?
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
- [ ] `docker exec -it <db> psql -U campus -d campusmatch -c "\d \"ProfileChunk\""` shows `embedding vector(384)` and the HNSW index

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

**`packages/core/src/embed.ts`**
```ts
const g = globalThis as unknown as { __extractor?: Promise<any> };

async function localEmbed(texts: string[]): Promise<number[][]> {
  if (!g.__extractor) {
    const { pipeline } = await import("@huggingface/transformers");
    g.__extractor = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  const extractor = await g.__extractor;
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}

async function openaiEmbed(texts: string[]): Promise<number[][]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts, dimensions: 384 }),
  });
  const j = await r.json();
  return j.data.map((d: any) => d.embedding);
}

export const embed = (texts: string[]) =>
  process.env.EMBEDDING_PROVIDER === "openai" ? openaiEmbed(texts) : localEmbed(texts);
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
import type { ProfileInput } from "./schemas";

export async function saveProfile(userId: string, p: ProfileInput) {
  const { year, branch, ...rest } = p;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { year, branch, onboarded: true } }),
    prisma.profile.upsert({ where: { userId }, create: { userId, ...rest }, update: rest }),
  ]);

  const chunks = buildChunks(p);
  const facets = Object.keys(chunks) as Facet[];
  const vectors = await embed(facets.map((f) => chunks[f]));   // one batched call

  for (let i = 0; i < facets.length; i++) {
    const facet = facets[i];
    await prisma.profileChunk.upsert({
      where: { userId_facet: { userId, facet } },
      create: { userId, facet, content: chunks[facet] },
      update: { content: chunks[facet] },
    });
    await setChunkEmbedding(userId, facet, vectors[i]);
  }
}
```

**`packages/core/scripts/warmup.ts`**
```ts
import { embed } from "../src/embed";
const v = await embed(["hello campus"]);
console.log("model ready, dim =", v[0].length);   // expect 384
```

**`packages/core/src/index.ts`**: re-export everything (`constants`, `schemas`, `aliases`, `auth`, `chunks`, `embed`, `profile`, `matching`).

### 🚩 CP3
- [ ] `npm run warmup` prints `dim = 384` (the first run downloads about 25 MB; later runs are instant)
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

> The first profile save takes about 2–5 seconds while the model loads in the Next server process. Call `embed(["warmup"])` once when the dev server starts (for example, open `/api/profile` GET in a tab) so the demo is instant.

### 🚩 CP5
- [ ] Complete onboarding in the browser
- [ ] In Prisma Studio, the `Profile` row exists and 4 `ProfileChunk` rows exist
- [ ] `SELECT facet, vector_dims(embedding) FROM "ProfileChunk";` → 4 rows × 384

---

## Phase 6: Seed Data + Matching Engine (B, 30 min) 🎯

### 6.1 Seed data: `packages/core/scripts/seed-profiles.json`
About 40 objects shaped like `ProfileInput` plus `email` and an optional `alias`. Spread them across these archetypes (6–7 each, plus blends):
- 🎮 **Night-owl gamer / anime**
- 🏋️ **Gym and sports**
- 💻 **Hackathon / CP grinder**
- 🎸 **Music / art / creative**
- 📚 **Bookish deep-talker**
- 🍜 **Foodie / traveler / social butterfly**

Prompt to generate it in advance:
> "Generate 40 JSON profiles of Indian engineering college students for a friend-matching app, matching this TypeScript type: {…paste ProfileInput…, email}. Use 6 archetypes (…). Make the free text casual, specific and varied (mention real games, shows, cafés-in-general, Hyderabad/Raichur campus life). Emails like seed01@iiitr.ac.in. Output only a JSON array."

Also add **2 demo accounts** (`demo1@iiitr.ac.in`, `demo2@iiitr.ac.in`) with near-identical interests so they match each other at the top.

### 6.2 `packages/core/scripts/seed.ts`
```ts
import { prisma } from "@campus/db";
import { randomAlias, saveProfile, ProfileInput } from "../src";
import data from "./seed-profiles.json" with { type: "json" };

for (const raw of data as any[]) {
  const { email, alias, ...p } = raw;
  const input = ProfileInput.parse(p);
  const user = await prisma.user.upsert({
    where: { email }, update: {},
    create: { email, ...randomAlias(), ...(alias ? { alias } : {}) },
  });
  await saveProfile(user.id, input);
  console.log("✓", email);
}
await prisma.$disconnect();
```
```bash
npm run seed      # about 30–60 s on CPU
```

### 6.3 `packages/core/src/matching.ts`: hybrid scoring
```ts
import { prisma, semanticCandidates } from "@campus/db";

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (new Set([...a, ...b]).size || 1);
};
const toPct = (s: number) => Math.round(Math.min(98, Math.max(55, 55 + ((s - 0.2) / 0.5) * 43)));
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
    select: { id: true, alias: true, avatarEmoji: true, year: true, profile: { select: { tags: true, lookingFor: true } } },
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

    return [{ userId: o.id, alias: o.alias, avatarEmoji: o.avatarEmoji, year: o.year,
              tags: o.profile.tags, score: toPct(final), reasons, icebreaker }];
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, take);
}
```
> **Cold-start fallback:** if fewer than 5 results come back, top up with random onboarded users (`ORDER BY random()`) that aren't excluded, with a score of about 55% and the reason "New on campus 👋".

**`apps/web/app/api/matches/recommendations/route.ts`**: `requireUserId()` → `getRecommendations(userId)` → JSON. **Never select `email` or `realName`.**

### 🚩 CP6 🎯
- [ ] Log in as `demo1`, then call `GET /api/matches/recommendations`. `demo2` should be in the top 3
- [ ] A gamer seed profile's top results are mostly gamers/anime people (sanity-check 3 archetypes)
- [ ] If results feel off, adjust `FACET_WEIGHTS` and the 0.7/0.2/0.1 split. Don't touch anything else

---

## Phase 7: Match Feed + Connect (C + A, 30 min)

**`apps/web/app/api/connect/route.ts`**
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@campus/db";
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
    const match = await prisma.match.upsert({
      where: { userAId_userBId: { userAId, userBId } }, create: { userAId, userBId }, update: {},
    });
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
- A grid or list of `MatchCard`: big emoji, alias, "2nd year", **match % badge**, reason bullets, up to 5 tags, and an icebreaker line
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
- `GET`: verify that I'm `userAId` or `userBId` of the match, else 404. Return the last 50 messages ascending: `{ id, senderId, text, createdAt }`
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
  const sock = useRef<Socket | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const hist = await fetch(`/api/chats/${matchId}/messages`).then((r) => r.json());
      if (alive) setMessages(hist);
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
    messages, peerTyping,
    send: (text: string) => sock.current?.emit("message:send", { matchId, text }),
    typing: () => sock.current?.emit("typing", matchId),
  };
}
```

**UI: `/chats/[matchId]`**
- Header: other person's emoji + alias, plus a "⋯" menu (Block)
- Message list: my bubbles on the right, theirs on the left. Auto-scroll to the bottom
- If there are no messages: show icebreaker chips (from shared tags). Clicking one fills the input
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
- [ ] Warm the model: hit any profile save once before presenting
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
| Next build/dev error about `onnxruntime-node` / `.node` file | Make sure `serverExternalPackages` includes `@huggingface/transformers` and `onnxruntime-node`. As a last resort, set `EMBEDDING_PROVIDER=openai` |
| Embeddings very slow the first time | The model is downloading or loading. Run `warmup`, and keep the dev server running |
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
