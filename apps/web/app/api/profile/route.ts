import { NextResponse } from "next/server";
import { ProfileInput, saveProfile } from "@campus/core";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = ProfileInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await saveProfile(userId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await prisma.profile.findUnique({ where: { userId } }));
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
