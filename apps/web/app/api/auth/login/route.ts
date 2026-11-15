import { NextResponse } from "next/server";
import { randomAlias, signSession, SESSION_COOKIE } from "@campus/core";
import { prisma } from "@campus/db";
import { z } from "zod";

const Body = z.object({
  email: z.string().email().max(254),
  otp: z.string().min(1).max(20),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or code" }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const domain = process.env.ALLOWED_EMAIL_DOMAIN?.toLowerCase();
  if (!domain) throw new Error("ALLOWED_EMAIL_DOMAIN is not configured");
  if (email.split("@").at(-1) !== domain) {
    return NextResponse.json({ error: "Use your campus email" }, { status: 403 });
  }
  if (!process.env.DEMO_OTP || parsed.data.otp !== process.env.DEMO_OTP) {
    return NextResponse.json({ error: "Wrong code" }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, ...randomAlias() },
  });
  const response = NextResponse.json({ onboarded: user.onboarded });
  response.cookies.set(SESSION_COOKIE, await signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
