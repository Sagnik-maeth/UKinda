-- DropIndex
DROP INDEX IF EXISTS "profile_chunk_embedding_hnsw";

-- AlterTable
ALTER TABLE "ProfileChunk"
ALTER COLUMN "embedding" TYPE vector(768);

-- AlterTable
ALTER TABLE "Match"
ADD COLUMN "icebreakers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "vibe" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS profile_chunk_embedding_hnsw
  ON "ProfileChunk" USING hnsw (embedding vector_cosine_ops);
