import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@campus/core";

export async function requireUserId(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Response("Unauthorized", { status: 401 });
  try {
    return (await verifySession(token)).userId;
  } catch {
    throw new Response("Unauthorized", { status: 401 });
  }
}
