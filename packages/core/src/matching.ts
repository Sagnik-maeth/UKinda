import { prisma, semanticCandidates } from "@campus/db";

const FACET_REASON: Record<string, string> = {
  PERSONALITY: "similar personalities",
  INTERESTS: "overlapping interests",
  LIFESTYLE: "similar weekend vibes",
  INTENT: "want the same kind of friendship",
};

function jaccard(first: string[], second: string[]) {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  const intersection = [...firstSet].filter((value) => secondSet.has(value)).length;
  return intersection / (new Set([...firstSet, ...secondSet]).size || 1);
}

function toPercent(score: number) {
  return Math.round(Math.min(98, Math.max(55, 55 + ((score - 0.2) / 0.5) * 43)));
}

export async function getRecommendations(userId: string, take = 10) {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) return [];

  const rows = await semanticCandidates(userId, 50);
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((row) => row.userId) }, onboarded: true },
    select: {
      id: true,
      alias: true,
      avatarEmoji: true,
      year: true,
      profile: { select: { tags: true, lookingFor: true } },
    },
  });
  const userById = new Map(users.map((user) => [user.id, user]));
  const recommendations = rows.flatMap((row) => {
    const other = userById.get(row.userId);
    if (!other?.profile) return [];

    const sharedTags = other.profile.tags.filter((tag) => profile.tags.includes(tag));
    const sharedIntents = other.profile.lookingFor.filter((item) => profile.lookingFor.includes(item));
    const score =
      0.7 * row.semantic +
      0.2 * jaccard(profile.tags, other.profile.tags) +
      0.1 * (sharedIntents.length > 0 ? 1 : 0);
    const topFacet = Object.entries(row.facets).sort((a, b) => b[1] - a[1])[0]?.[0];
    const reasons = [
      sharedTags.length ? `You both like ${sharedTags.slice(0, 3).join(", ")}` : null,
      topFacet ? `Strongest link: ${FACET_REASON[topFacet]}` : null,
      sharedIntents.length ? `Both looking for ${sharedIntents[0]}` : null,
    ].filter((reason): reason is string => Boolean(reason));

    return [{
      userId: other.id,
      alias: other.alias,
      avatarEmoji: other.avatarEmoji,
      year: other.year,
      tags: other.profile.tags,
      score: toPercent(score),
      reasons,
      icebreaker: sharedTags[0]
        ? `Ask them about their favourite thing in ${sharedTags[0]} 👀`
        : "Ask about their perfect weekend 🌤️",
    }];
  });

  const seen = new Set(recommendations.map((item) => item.userId));
  if (recommendations.length < Math.min(5, take)) {
    const excludedLikes = await prisma.like.findMany({
      where: { fromUserId: userId },
      select: { toUserId: true },
    });
    const blocked = await prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const excludedIds = new Set([
      userId,
      ...excludedLikes.map((like) => like.toUserId),
      ...blocked.flatMap((item) => [item.blockerId, item.blockedId]),
      ...seen,
    ]);
    const fallback = await prisma.user.findMany({
      where: {
        onboarded: true,
        id: { notIn: [...excludedIds] },
        profile: { isNot: null },
      },
      select: {
        id: true,
        alias: true,
        avatarEmoji: true,
        year: true,
        profile: { select: { tags: true } },
      },
      take: Math.max(0, take - recommendations.length),
    });
    recommendations.push(...fallback.flatMap((other) => other.profile ? [{
      userId: other.id,
      alias: other.alias,
      avatarEmoji: other.avatarEmoji,
      year: other.year,
      tags: other.profile.tags,
      score: 55,
      reasons: ["New on campus 👋"],
      icebreaker: "Ask about their perfect weekend 🌤️",
    }] : []));
  }

  return recommendations.sort((a, b) => b.score - a.score).slice(0, take);
}
