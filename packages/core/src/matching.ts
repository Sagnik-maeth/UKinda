import { prisma, semanticCandidates } from "@campus/db";
import { FACET_WEIGHTS } from "./constants";
import { getDemoBuddyId } from "./demo";

const FACET_REASON: Record<string, string> = {
  PERSONALITY: "similar personalities",
  INTERESTS: "overlapping interests",
  LIFESTYLE: "similar weekend vibes",
  INTENT: "want the same kind of friendship",
};

// Gemini similarities sit in a narrow, high band. Calibrated on the seed set (CP6): top matches raw ≈ 0.85–1.0,
// weak ones ≈ 0.70–0.75. Re-tune from the `raw` values logged with MATCH_DEBUG=1.
const LOW = Number(process.env.MATCH_LOW ?? 0.68);
const HIGH = Number(process.env.MATCH_HIGH ?? 0.88);
const toPercent = (raw: number) =>
  Math.round(Math.min(98, Math.max(55, 55 + ((raw - LOW) / (HIGH - LOW)) * 43)));

function jaccard(first: string[], second: string[]) {
  const firstSet = new Set(first);
  const secondSet = new Set(second);
  const intersection = [...firstSet].filter((value) => secondSet.has(value)).length;
  return intersection / (new Set([...firstSet, ...secondSet]).size || 1);
}

export type Recommendation = {
  userId: string;
  alias: string;
  avatarEmoji: string;
  year: number | null;
  vibe: string | null;
  tags: string[];
  score: number;
  raw: number;
  reasons: string[];
  icebreaker: string;
};

// Safe public fields only: never select email or realName here.
const publicSelect = {
  id: true,
  alias: true,
  avatarEmoji: true,
  year: true,
  profile: { select: { tags: true, lookingFor: true, vibe: true } },
} as const;

/** Demo mode: put the demo buddy first in the feed (unless already connected/skipped/blocked). */
async function pinDemoBuddy(userId: string, myTags: string[], scored: Recommendation[]) {
  const buddyId = await getDemoBuddyId();
  if (!buddyId || buddyId === userId) return;

  const index = scored.findIndex((item) => item.userId === buddyId);
  if (index >= 0) {
    scored.unshift(...scored.splice(index, 1));
    return;
  }
  // Not among the semantic candidates: add it, unless the user already acted on it or a block exists.
  const [liked, blocked] = await Promise.all([
    prisma.like.findUnique({ where: { fromUserId_toUserId: { fromUserId: userId, toUserId: buddyId } }, select: { id: true } }),
    prisma.block.findFirst({
      where: { OR: [{ blockerId: userId, blockedId: buddyId }, { blockerId: buddyId, blockedId: userId }] },
      select: { id: true },
    }),
  ]);
  if (liked || blocked) return;
  const buddy = await prisma.user.findUnique({ where: { id: buddyId }, select: publicSelect });
  if (!buddy?.profile) return;
  const sharedTags = buddy.profile.tags.filter((tag) => myTags.includes(tag));
  scored.unshift({
    userId: buddy.id,
    alias: buddy.alias,
    avatarEmoji: buddy.avatarEmoji,
    year: buddy.year,
    vibe: buddy.profile.vibe,
    tags: buddy.profile.tags,
    score: 90,
    raw: 1,
    reasons: [
      sharedTags.length ? `You both like ${sharedTags.slice(0, 3).join(", ")}` : "Always up for a chat 👋",
    ],
    icebreaker: "Say hi and ask about their perfect weekend 🌤️",
  });
}

export async function getRecommendations(userId: string, take = 10): Promise<Recommendation[]> {
  const me = await prisma.profile.findUnique({ where: { userId } });
  if (!me) return [];

  const rows = await semanticCandidates(userId, 50, FACET_WEIGHTS);
  const others = await prisma.user.findMany({
    where: { id: { in: rows.map((row) => row.userId) }, onboarded: true },
    select: publicSelect,
  });
  const byId = new Map(others.map((other) => [other.id, other]));

  const scored: Recommendation[] = rows.flatMap((row) => {
    const other = byId.get(row.userId);
    if (!other?.profile) return [];

    const sharedTags = other.profile.tags.filter((tag) => me.tags.includes(tag));
    const sharedIntents = other.profile.lookingFor.filter((item) => me.lookingFor.includes(item));
    const raw =
      0.7 * row.semantic +
      0.2 * jaccard(me.tags, other.profile.tags) +
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
      vibe: other.profile.vibe,
      tags: other.profile.tags,
      score: toPercent(raw),
      raw,
      reasons,
      icebreaker: sharedTags[0]
        ? `Ask them about their favourite thing in ${sharedTags[0]} 👀`
        : "Ask about their perfect weekend 🌤️",
    }];
  });

  scored.sort((a, b) => b.raw - a.raw);
  await pinDemoBuddy(userId, me.tags, scored);
  const results = scored.slice(0, take);

  // Cold-start fallback: top up with random onboarded users who aren't excluded.
  if (results.length < Math.min(5, take)) {
    const [likes, blocks] = await Promise.all([
      prisma.like.findMany({ where: { fromUserId: userId }, select: { toUserId: true } }),
      prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const excluded = [...new Set([
      userId,
      ...results.map((item) => item.userId),
      ...likes.map((like) => like.toUserId),
      ...blocks.flatMap((block) => [block.blockerId, block.blockedId]),
    ])];
    const randomIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM "User" u
      JOIN "Profile" p ON p."userId" = u.id
      WHERE u.onboarded = true AND NOT (u.id = ANY(${excluded}::text[]))
      ORDER BY random()
      LIMIT ${take - results.length}`;
    const fallback = await prisma.user.findMany({
      where: { id: { in: randomIds.map((row) => row.id) } },
      select: publicSelect,
    });
    for (const other of fallback) {
      if (!other.profile) continue;
      results.push({
        userId: other.id,
        alias: other.alias,
        avatarEmoji: other.avatarEmoji,
        year: other.year,
        vibe: other.profile.vibe,
        tags: other.profile.tags,
        score: 55,
        raw: 0,
        reasons: ["New on campus 👋"],
        icebreaker: "Ask about their perfect weekend 🌤️",
      });
    }
  }

  if (process.env.MATCH_DEBUG === "1" && results.length) {
    const fmt = (item: Recommendation) => `${item.alias} raw=${item.raw.toFixed(3)} → ${item.score}%`;
    console.log(`[matching] top: ${fmt(results[0])} | bottom: ${fmt(results[results.length - 1])}`);
  }

  return results;
}
