import { NextResponse } from "next/server";
import { signSession } from "@campus/core";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json({ token: await signSession(userId, "10m") });
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
