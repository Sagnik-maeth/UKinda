import { NextResponse, type NextRequest } from "next/server";
// Import the auth subpath only: the full @campus/core barrel pulls in Prisma + the embedding model.
import { SESSION_COOKIE, verifySession } from "@campus/core/auth";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await verifySession(token);
      return NextResponse.next();
    } catch {
      // An invalid session is treated as unauthenticated.
    }
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/onboarding", "/matches/:path*", "/chats/:path*"],
};
