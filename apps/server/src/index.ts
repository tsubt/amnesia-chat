import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8787);
const MAX_PAYLOAD = 64_000;

type Role = "d" | "s";

type ClientMeta = {
  roomCode: string;
  role: Role;
};

type Room = {
  code: string;
  d?: WebSocket;
  s?: WebSocket;
  createdAt: number;
  lastActive: number;
};

type WireMessage =
  | { type: "create" }
  | { type: "join"; code: string }
  | { type: "rejoin"; code: string; role: Role }
  | { type: "relay"; payload: string }
  | { type: "ping" };

const rooms = new Map<string, Room>();
const clients = new WeakMap<WebSocket, ClientMeta>();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 6): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function send(ws: WebSocket, data: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function getPeer(room: Room, role: Role): WebSocket | undefined {
  return role === "d" ? room.s : room.d;
}

function touch(room: Room) {
  room.lastActive = Date.now();
}

function detach(ws: WebSocket) {
  const meta = clients.get(ws);
  if (!meta) return;
  clients.delete(ws);
  const room = rooms.get(meta.roomCode);
  if (!room) return;

  if (meta.role === "d" && room.d === ws) room.d = undefined;
  if (meta.role === "s" && room.s === ws) room.s = undefined;
  touch(room);

  const peer = getPeer(room, meta.role);
  if (peer) {
    send(peer, { type: "peer_left", role: meta.role });
  }
  // Keep empty rooms for a while so D can refresh / rejoin.
}

function slotOpen(ws: WebSocket | undefined): boolean {
  return !ws || ws.readyState !== ws.OPEN;
}

function createRoom(ws: WebSocket) {
  detach(ws);
  let code = randomCode();
  while (rooms.has(code)) code = randomCode();
  const now = Date.now();
  const room: Room = { code, d: ws, createdAt: now, lastActive: now };
  rooms.set(code, room);
  clients.set(ws, { roomCode: code, role: "d" });
  send(ws, {
    type: "created",
    code,
    role: "d",
  });
}

function joinRoom(ws: WebSocket, codeRaw: string) {
  detach(ws);
  const code = codeRaw.trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(ws, { type: "error", message: "Room not found" });
    return;
  }
  if (!slotOpen(room.s)) {
    send(ws, { type: "error", message: "Room already has an S peer" });
    return;
  }
  room.s = ws;
  touch(room);
  clients.set(ws, { roomCode: code, role: "s" });
  send(ws, {
    type: "joined",
    code,
    role: "s",
  });
  if (room.d && room.d.readyState === room.d.OPEN) {
    send(room.d, { type: "peer_joined", role: "s" });
    send(ws, { type: "peer_joined", role: "d" });
  }
}

function rejoinRoom(ws: WebSocket, codeRaw: string, role: Role) {
  detach(ws);
  const code = codeRaw.trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(ws, { type: "error", message: "Room not found" });
    return;
  }

  if (role === "d") {
    if (!slotOpen(room.d)) {
      send(ws, { type: "error", message: "D is already connected" });
      return;
    }
    room.d = ws;
  } else {
    if (!slotOpen(room.s)) {
      send(ws, { type: "error", message: "S is already connected" });
      return;
    }
    room.s = ws;
  }

  touch(room);
  clients.set(ws, { roomCode: code, role });
  send(ws, {
    type: "joined",
    code,
    role,
  });

  const peer = getPeer(room, role);
  if (peer && peer.readyState === peer.OPEN) {
    send(peer, { type: "peer_joined", role });
    send(ws, { type: "peer_joined", role: role === "d" ? "s" : "d" });
  }
}

function relay(ws: WebSocket, payload: string) {
  if (typeof payload !== "string" || payload.length > MAX_PAYLOAD) {
    send(ws, { type: "error", message: "Payload too large" });
    return;
  }
  const meta = clients.get(ws);
  if (!meta) {
    send(ws, { type: "error", message: "Not in a room" });
    return;
  }
  const room = rooms.get(meta.roomCode);
  if (!room) {
    send(ws, { type: "error", message: "Room gone" });
    return;
  }
  const peer = getPeer(room, meta.role);
  if (!peer || peer.readyState !== peer.OPEN) {
    send(ws, { type: "error", message: "Peer not connected" });
    return;
  }
  touch(room);
  send(peer, { type: "relay", from: meta.role, payload });
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  send(ws, { type: "hello", serverTime: Date.now() });

  ws.on("message", (raw) => {
    let msg: WireMessage;
    try {
      msg = JSON.parse(String(raw)) as WireMessage;
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "create":
        createRoom(ws);
        break;
      case "join":
        joinRoom(ws, msg.code ?? "");
        break;
      case "rejoin":
        if (msg.role !== "d" && msg.role !== "s") {
          send(ws, { type: "error", message: "Invalid role" });
          break;
        }
        rejoinRoom(ws, msg.code ?? "", msg.role);
        break;
      case "relay":
        relay(ws, msg.payload ?? "");
        break;
      case "ping":
        send(ws, { type: "pong", serverTime: Date.now() });
        break;
      default:
        send(ws, { type: "error", message: "Unknown message type" });
    }
  });

  ws.on("close", () => detach(ws));
  ws.on("error", () => detach(ws));
});

// Remove rooms with no open sockets after 2h idle (active rooms never expire)
const EMPTY_TTL_MS = 2 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const dOpen = room.d && room.d.readyState === room.d.OPEN;
    const sOpen = room.s && room.s.readyState === room.s.OPEN;
    if (dOpen || sOpen) continue;
    if (now - room.lastActive > EMPTY_TTL_MS) rooms.delete(code);
  }
}, 60_000).unref();

console.log(`Amnesia Chat relay listening on ws://localhost:${PORT}`);
