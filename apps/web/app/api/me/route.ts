import { NextResponse } from "next/server";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, alias: true, avatarEmoji: true, year: true, onboarded: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
