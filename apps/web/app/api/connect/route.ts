import { NextResponse } from "next/server";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";
import { z } from "zod";

const Body = z.object({
  targetId: z.string().min(1),
  action: z.enum(["CONNECT", "SKIP"]),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = Body.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid connection action" }, { status: 400 });
    const { targetId, action } = parsed.data;
    if (targetId === userId) return NextResponse.json({ error: "You cannot connect with yourself" }, { status: 400 });
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, onboarded: true } });
    if (!target?.onboarded) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: targetId },
          { blockerId: targetId, blockedId: userId },
        ],
      },
    });
    if (block) return NextResponse.json({ error: "This profile is unavailable" }, { status: 404 });

    await prisma.like.upsert({
      where: { fromUserId_toUserId: { fromUserId: userId, toUserId: targetId } },
      create: { fromUserId: userId, toUserId: targetId, action },
      update: { action },
    });
    if (action === "SKIP") return NextResponse.json({ matched: false });

    const reverse = await prisma.like.findUnique({
      where: { fromUserId_toUserId: { fromUserId: targetId, toUserId: userId } },
      select: { action: true },
    });
    if (reverse?.action !== "CONNECT") return NextResponse.json({ matched: false });

    const [userAId, userBId] = [userId, targetId].sort();
    const match = await prisma.match.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId },
      update: {},
      select: { id: true },
    });
    return NextResponse.json({ matched: true, matchId: match.id });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
