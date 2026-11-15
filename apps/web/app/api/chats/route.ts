import { NextResponse } from "next/server";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

// Safe public fields only: never select email or realName.
const publicUser = { select: { id: true, alias: true, avatarEmoji: true } } as const;

export async function GET() {
  try {
    const userId = await requireUserId();
    const [matches, blocks] = await Promise.all([
      prisma.match.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        include: {
          userA: publicUser,
          userB: publicUser,
          messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, senderId: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    // Hide a chat if either person blocked the other.
    const blockedIds = new Set(blocks.map((block) => (block.blockerId === userId ? block.blockedId : block.blockerId)));

    const chats = matches
      .map((match) => ({
        matchId: match.id,
        other: match.userA.id === userId ? match.userB : match.userA,
        lastMessage: match.messages[0] ?? null,
        createdAt: match.createdAt,
      }))
      .filter((chat) => !blockedIds.has(chat.other.id))
      // Most recent activity first.
      .sort((a, b) =>
        +new Date(b.lastMessage?.createdAt ?? b.createdAt) - +new Date(a.lastMessage?.createdAt ?? a.createdAt));

    return NextResponse.json(chats.map(({ createdAt: _createdAt, ...chat }) => chat));
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
