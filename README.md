# CampusMatch

Anonymous campus friend matching with profile embeddings, mutual connections, and realtime chat.

## Stack

- Next.js 16, React, TypeScript, and Tailwind CSS
- PostgreSQL 16 with pgvector, accessed through Prisma 6
- Transformers.js embeddings running locally by default
- Socket.IO for realtime chat

## Prerequisites

- Node.js 20.9+ and npm 10+
- Docker Desktop (or Docker Engine) with Compose

## Quick start

1. Copy `.env.example` to `.env` and set a random `JWT_SECRET`.
2. Install dependencies from the repository root and start PostgreSQL:

   ```sh
   npm install
   npm run db:up
   ```

3. Generate the Prisma client, apply migrations, and load demo accounts:

   ```sh
   npm run db:generate
   npm run db:migrate
   npm run seed
   ```

4. Start the web and realtime servers:

   ```sh
   npm run dev
   ```

Open <http://localhost:3000>. Demo sign-in uses an `@iiitr.ac.in` address and the OTP in `.env` (default: `123456`). The first local embedding run downloads the model; run `npm run warmup` ahead of a demo to cache it.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run db:up` / `npm run db:down` | Start or stop PostgreSQL |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:reset` | Reset the local database |
| `npm run seed` | Load sample profiles and demo users |
| `npm run warmup` | Download and validate the embedding model |
| `npm run build` | Build workspace packages and the web app |

If Docker is unavailable, the application code can still be installed and built, but database-backed features need a PostgreSQL 16 instance with the pgvector extension.

## Privacy

Use synthetic profiles for demos. Emails and real names are never included in public profile, recommendation, or chat responses. The demo OTP is not suitable for production; configure real email verification, rate limiting, and moderation before deploying.
