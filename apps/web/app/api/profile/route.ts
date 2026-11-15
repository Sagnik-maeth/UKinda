import { NextResponse } from "next/server";
import { ProfileInput, saveProfile } from "@campus/core";
import { prisma } from "@campus/db";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";

const FIELD_LABELS: Record<string, string> = {
  weekend: "Perfect weekend",
  talkAbout: "Could talk for hours about",
  lookingForText: "In your own words",
  tags: "Interests",
  lookingFor: "I'm looking for",
  availability: "Usually free",
  unpopularOpinion: "Unpopular opinion",
  favorites: "Favourites",
};

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
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: `${FIELD_LABELS[String(issue.path[0])] ?? issue.path.join(".")}: ${issue.message}`, details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    try {
      await saveProfile(userId, parsed.data);
    } catch (error) {
      // Usually Gemini (missing/invalid key, quota) or the DB. Log the cause, keep the response generic.
      console.error("[profile] saveProfile failed", error);
      return NextResponse.json(
        { error: "We couldn't process your profile right now. Please try again in a moment." },
        { status: 503 },
      );
    }
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
