import { NextResponse } from "next/server";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        AND: [{
          NOT: {
            OR: [
              { userA: { blocksMade: { some: { blockedId: { equals: userId } } } } },
              { userB: { blocksMade: { some: { blockedId: { equals: userId } } } } },
            ],
          },
        }],
      },
      include: {
        userA: { select: { id: true, alias: true, avatarEmoji: true } },
        userB: { select: { id: true, alias: true, avatarEmoji: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(matches.map((match) => ({
      matchId: match.id,
      other: match.userA.id === userId ? match.userB : match.userA,
      lastMessage: match.messages[0] ?? null,
    })));
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
