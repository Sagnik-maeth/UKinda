import { NextResponse } from "next/server";
import { getRecommendations } from "@campus/core";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await getRecommendations(userId));
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}
