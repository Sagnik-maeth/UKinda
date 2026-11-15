import { NextResponse } from "next/server";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ matchId: string }> };

// Safe public fields only: never select email or realName.
const publicUser = { select: { id: true, alias: true, avatarEmoji: true } } as const;

export async function GET(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { matchId } = await context.params;
    const match = await prisma.match.findFirst({
      where: { id: matchId, OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true, icebreakers: true, userA: publicUser, userB: publicUser },
    });
    if (!match) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    // A block in either direction hides the chat, matching the realtime server's join check.
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: match.userAId, blockedId: match.userBId },
          { blockerId: match.userBId, blockedId: match.userAId },
        ],
      },
      select: { id: true },
    });
    if (blocked) return NextResponse.json({ error: "Chat not found" }, { status: 404 });

    const messages = await prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, senderId: true, text: true, createdAt: true },
    });
    return NextResponse.json({
      me: userId,
      other: match.userAId === userId ? match.userB : match.userA,
      messages: messages.reverse(),
      icebreakers: match.icebreakers,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
