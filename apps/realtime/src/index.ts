import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { prisma } from "@campus/db";
import { verifySession } from "@campus/core/auth";

const PORT = Number(process.env.REALTIME_PORT ?? 4000);
const MAX_LEN = 1000;

type Ack = (result: { ok: boolean }) => void;

const http = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("ok");
});

const io = new Server(http, {
  cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:3000", credentials: true },
});

/** True if either participant of the match has blocked the other. */
async function isBlocked(userAId: string, userBId: string) {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userAId, blockedId: userBId },
        { blockerId: userBId, blockedId: userAId },
      ],
    },
    select: { id: true },
  });
  return Boolean(block);
}

/** Wraps an async handler so a DB error can't become an unhandled rejection and crash the server. */
function safe<A extends unknown[]>(socket: Socket, handler: (...args: A) => Promise<void>) {
  return (...args: A) => {
    handler(...args).catch((error: unknown) => {
      console.error(`[realtime] handler failed for ${socket.data.userId}`, error);
      const ack = args.at(-1);
      if (typeof ack === "function") (ack as Ack)({ ok: false });
    });
  };
}

io.use(async (socket, next) => {
  try {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string") throw new Error("missing token");
    socket.data.userId = (await verifySession(token)).userId;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  const uid: string = socket.data.userId;

  socket.on("join", safe(socket, async (matchId: unknown, ack?: Ack) => {
    if (typeof matchId !== "string") return ack?.({ ok: false });
    const match = await prisma.match.findFirst({
      where: { id: matchId, OR: [{ userAId: uid }, { userBId: uid }] },
      select: { userAId: true, userBId: true },
    });
    if (!match || (await isBlocked(match.userAId, match.userBId))) return ack?.({ ok: false });
    await socket.join(matchId);
    ack?.({ ok: true });
  }));

  socket.on("message:send", safe(socket, async (payload: unknown, ack?: Ack) => {
    const { matchId, text } = (payload ?? {}) as { matchId?: unknown; text?: unknown };
    // Membership was verified at join; only joined rooms can receive messages.
    if (typeof matchId !== "string" || !socket.rooms.has(matchId)) return ack?.({ ok: false });
    const clean = String(text ?? "").trim().slice(0, MAX_LEN);
    if (!clean) return ack?.({ ok: false });

    // Re-check blocks so a block made mid-conversation takes effect immediately.
    const match = await prisma.match.findUnique({ where: { id: matchId }, select: { userAId: true, userBId: true } });
    if (!match || (await isBlocked(match.userAId, match.userBId))) {
      await socket.leave(matchId);
      return ack?.({ ok: false });
    }

    const message = await prisma.message.create({
      data: { matchId, senderId: uid, text: clean },
      select: { id: true, matchId: true, senderId: true, text: true, createdAt: true },
    });
    io.to(matchId).emit("message:new", message);
    ack?.({ ok: true });
  }));

  socket.on("typing", (matchId: unknown) => {
    if (typeof matchId === "string" && socket.rooms.has(matchId)) {
      socket.to(matchId).emit("typing", { matchId });
    }
  });
});

http.listen(PORT, () => console.log(`realtime on :${PORT}`));

async function shutdown() {
  io.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
