import { SignJWT, jwtVerify } from "jose";

function getKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string, ttl = "7d") {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(getKey());
}

export async function verifySession(token: string) {
  const { payload } = await jwtVerify(token, getKey());
  if (typeof payload.sub !== "string") {
    throw new Error("Session token does not contain a user ID");
  }
  return { userId: payload.sub };
}

export const SESSION_COOKIE = "cm_session";
