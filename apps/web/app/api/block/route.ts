import { NextResponse } from "next/server";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";
import { z } from "zod";

const Body = z.object({ targetId: z.string().min(1) });

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
    if (!parsed.success || parsed.data.targetId === userId) {
      return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
    }
    const { targetId } = parsed.data;
    // Unknown IDs would otherwise fail the foreign key and surface as a 500.
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
      create: { blockerId: userId, blockedId: targetId },
      update: {},
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
