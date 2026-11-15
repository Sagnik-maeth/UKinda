import { prisma, setChunkEmbedding, type Facet } from "@campus/db";
import { buildChunks } from "./chunks";
import { embed } from "./embed";
import type { ProfileInput } from "./schemas";

export async function saveProfile(userId: string, profile: ProfileInput) {
  const { year, branch, ...profileData } = profile;
  const chunks = buildChunks(profile);
  const facets = Object.keys(chunks) as Facet[];
  const vectors = await embed(facets.map((facet) => chunks[facet]));

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: userId },
      data: { year, branch, onboarded: true },
    });
    await transaction.profile.upsert({
      where: { userId },
      create: { userId, ...profileData },
      update: profileData,
    });
    for (const facet of facets) {
      await transaction.profileChunk.upsert({
        where: { userId_facet: { userId, facet } },
        create: { userId, facet, content: chunks[facet] },
        update: { content: chunks[facet] },
      });
    }
  });

  for (let index = 0; index < facets.length; index += 1) {
    await setChunkEmbedding(userId, facets[index], vectors[index]);
  }
}
