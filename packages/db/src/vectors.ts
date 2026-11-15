import type { Facet } from "@prisma/client";
import { prisma } from "./index";

function toVectorLiteral(vector: number[]) {
  if (vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding must contain 768 finite numbers");
  }
  return `[${vector.join(",")}]`;
}

export async function setChunkEmbedding(userId: string, facet: Facet, embedding: number[]) {
  await prisma.$executeRaw`
    UPDATE "ProfileChunk"
    SET embedding = ${toVectorLiteral(embedding)}::vector
    WHERE "userId" = ${userId} AND facet = ${facet}::"Facet"`;
}

export type SemanticRow = {
  userId: string;
  semantic: number;
  facets: Record<string, number>;
};

export type FacetWeights = Record<Facet, number>;

const DEFAULT_WEIGHTS: FacetWeights = { PERSONALITY: 0.3, INTERESTS: 0.4, LIFESTYLE: 0.15, INTENT: 0.15 };

export async function semanticCandidates(
  userId: string,
  limit = 50,
  weights: FacetWeights = DEFAULT_WEIGHTS,
): Promise<SemanticRow[]> {
  return prisma.$queryRaw<SemanticRow[]>`
    WITH me AS (
      SELECT facet, embedding FROM "ProfileChunk"
      WHERE "userId" = ${userId} AND embedding IS NOT NULL
    ),
    weights(facet, w) AS (
      VALUES ('PERSONALITY', ${weights.PERSONALITY}::float8), ('INTERESTS', ${weights.INTERESTS}::float8),
             ('LIFESTYLE', ${weights.LIFESTYLE}::float8), ('INTENT', ${weights.INTENT}::float8)
    ),
    excluded AS (
      SELECT "toUserId" AS id FROM "Like" WHERE "fromUserId" = ${userId}
      UNION SELECT "blockedId" FROM "Block" WHERE "blockerId" = ${userId}
      UNION SELECT "blockerId" FROM "Block" WHERE "blockedId" = ${userId}
    )
    SELECT o."userId",
           SUM(w.w * (1 - (o.embedding <=> me.embedding)))::float8 AS semantic,
           json_object_agg(o.facet, 1 - (o.embedding <=> me.embedding)) AS facets
    FROM me
    JOIN "ProfileChunk" o ON o.facet = me.facet AND o."userId" <> ${userId}
    JOIN weights w ON w.facet = me.facet::text
    JOIN "User" candidate ON candidate.id = o."userId" AND candidate.onboarded = true
    WHERE o.embedding IS NOT NULL
      AND o."userId" NOT IN (SELECT id FROM excluded)
    GROUP BY o."userId"
    ORDER BY semantic DESC
    LIMIT ${limit}`;
}
