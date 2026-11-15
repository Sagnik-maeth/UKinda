import { prisma, setChunkEmbedding, type Facet } from "@campus/db";
import { generateVibe } from "./ai";
import { buildChunks } from "./chunks";
import { embed } from "./embed";
import type { ProfileInput } from "./schemas";

export type ProfileCache = { vectors: number[][]; vibe: string | null };

function validateCache(cache: ProfileCache, expectedCount: number) {
  if (
    cache.vectors.length !== expectedCount ||
    cache.vectors.some((vector) =>
      vector.length !== 768 || vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error("Cached profile embeddings do not match the 768-dimensional profile format");
  }
}

export async function saveProfile(
  userId: string,
  profile: ProfileInput,
  cached?: ProfileCache,
): Promise<ProfileCache> {
  const chunks = buildChunks(profile);
  const facets = Object.keys(chunks) as Facet[];
  const [vectors, vibe] = cached
    ? [cached.vectors, cached.vibe]
    : await Promise.all([
      embed(facets.map((facet) => chunks[facet])),
      generateVibe(profile),
    ]);
  if (cached) validateCache(cached, facets.length);

  const { year, branch, ...profileData } = profile;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { year, branch, onboarded: true },
    }),
    prisma.profile.upsert({
      where: { userId },
      create: { userId, ...profileData, vibe },
      update: { ...profileData, vibe },
    }),
  ]);

  for (let index = 0; index < facets.length; index += 1) {
    const facet = facets[index];
    await prisma.profileChunk.upsert({
      where: { userId_facet: { userId, facet } },
      create: { userId, facet, content: chunks[facet] },
      update: { content: chunks[facet] },
    });
    await setChunkEmbedding(userId, facet, vectors[index]);
  }
  return { vectors, vibe };
}
