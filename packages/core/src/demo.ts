import { prisma } from "@campus/db";

/**
 * Demo mode (DEMO_MODE="true" in .env), for presenting live:
 * - the demo buddy (DEMO_BUDDY_EMAIL, default demo2@<campus domain>) is pinned to the top of everyone's feed
 * - pressing Connect on the buddy always matches instantly, so a chat opens right away
 * Log in as the buddy in a second (incognito) window to reply. Leave it off in production.
 */
export function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

export function demoBuddyEmail() {
  return (process.env.DEMO_BUDDY_EMAIL ?? `demo2@${process.env.ALLOWED_EMAIL_DOMAIN ?? "iiitr.ac.in"}`).toLowerCase();
}

/** The buddy's user id, or null when demo mode is off or the buddy account isn't seeded/onboarded. */
export async function getDemoBuddyId(): Promise<string | null> {
  if (!isDemoMode()) return null;
  const buddy = await prisma.user.findUnique({
    where: { email: demoBuddyEmail() },
    select: { id: true, onboarded: true },
  });
  return buddy?.onboarded ? buddy.id : null;
}

/** In demo mode, make the buddy "already connected" to `userId`, so the user's Connect creates a match. */
export async function demoBuddyConnectBack(userId: string, targetId: string) {
  const buddyId = await getDemoBuddyId();
  if (!buddyId || targetId !== buddyId || userId === buddyId) return;
  await prisma.like.upsert({
    where: { fromUserId_toUserId: { fromUserId: buddyId, toUserId: userId } },
    create: { fromUserId: buddyId, toUserId: userId, action: "CONNECT" },
    update: { action: "CONNECT" },
  });
}
