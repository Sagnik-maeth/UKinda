import { NextResponse } from "next/server";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";

type RouteContext = { params: Promise<{ matchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { matchId } = await context.params;
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        OR: [{ userAId: userId }, { userBId: userId }],
        NOT: {
          OR: [
            { userA: { blocksMade: { some: { blockedId: { equals: userId } } } } },
            { userB: { blocksMade: { some: { blockedId: { equals: userId } } } } },
          ],
        },
      },
      select: { id: true },
    });
    if (!match) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const messages = await prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, senderId: true, text: true, createdAt: true },
    });
    return NextResponse.json(messages.reverse());
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
