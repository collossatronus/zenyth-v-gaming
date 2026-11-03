import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import Stripe from "stripe";
import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.SITE_ORIGIN;
const siteUrl = process.env.SITE_URL;
const rooms = new Map();
const donationAttempts = new Map();
const maxMessageLength = 2000;
const maxRoomAgeMs = 12 * 60 * 60 * 1000;

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (origin === allowedOrigin) return true;
  return process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function sendError(socket, message) {
  safeSend(socket, { type: "error", message });
}

function membersSnapshot(room, excludedId) {
  return [...room.members.values()]
    .filter((member) => member.id !== excludedId)
    .map((member) => ({ id: member.id, name: member.name }));
}

function broadcast(room, payload, excludedId) {
  for (const member of room.members.values()) {
    if (member.id !== excludedId) safeSend(member.socket, payload);
  }
}

function leaveRoom(socket) {
  if (!socket.roomCode) return;
  const room = rooms.get(socket.roomCode);
  const memberId = socket.memberId;
  socket.roomCode = null;
  socket.memberId = null;
  if (!room) return;
  room.members.delete(memberId);
  broadcast(room, { type: "member_left", memberId });
  if (!room.members.size) rooms.delete(room.code);
}

function joinRoom(socket, code) {
  if (typeof code !== "string" || !/^[A-Z0-9_-]{4,32}$/.test(code)) {
    sendError(socket, "Le code du salon doit contenir de 4 à 32 lettres, chiffres, tirets ou tirets bas.");
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    sendError(socket, "Salon introuvable ou terminé. Vérifie le code ou crée un nouveau salon.");
    return;
  }
  if (socket.roomCode === code) return;
  leaveRoom(socket);
  const member = { id: randomUUID(), name: `Ami-${room.members.size + 1}`, socket };
  socket.memberId = member.id;
  socket.roomCode = room.code;
  room.members.set(member.id, member);
  safeSend(socket, {
    type: "room_joined",
    roomCode: room.code,
    memberId: member.id,
    members: membersSnapshot(room, member.id),
    messages: room.messages.slice(-100)
  });
  broadcast(room, { type: "member_joined", member: { id: member.id, name: member.name } }, member.id);
}

function handleSocketMessage(socket, raw) {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    sendError(socket, "Message invalide.");
    return;
  }

  if (message.type === "create_room") {
    const code = typeof message.roomCode === "string" ? message.roomCode.trim().toUpperCase() : "";
    if (!/^[A-Z0-9_-]{4,32}$/.test(code)) {
      sendError(socket, "Choisis un code de 4 à 32 lettres, chiffres, tirets ou tirets bas.");
      return;
    }
    if (rooms.has(code)) {
      sendError(socket, "Ce code est déjà utilisé. Choisis-en un autre.");
      return;
    }
    if (socket.roomCode) leaveRoom(socket);
    const room = { code, createdAt: Date.now(), members: new Map(), messages: [] };
    rooms.set(code, room);
    const member = { id: randomUUID(), name: "Ami-1", socket };
    socket.memberId = member.id;
    socket.roomCode = code;
    room.members.set(member.id, member);
    safeSend(socket, {
      type: "room_created",
      roomCode: code,
      memberId: member.id,
      members: [],
      messages: []
    });
    return;
  }

  if (message.type === "join_room") {
    joinRoom(socket, message.roomCode);
    return;
  }

  const room = socket.roomCode && rooms.get(socket.roomCode);
  if (!room || !room.members.has(socket.memberId)) {
    sendError(socket, "Rejoins un salon pour utiliser cette fonction.");
    return;
  }

  if (message.type === "chat") {
    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (!text || text.length > maxMessageLength) {
      sendError(socket, `Un message doit contenir de 1 à ${maxMessageLength} caractères.`);
      return;
    }
    const member = room.members.get(socket.memberId);
    const chatMessage = {
      id: randomUUID(),
      memberId: member.id,
      name: member.name,
      text,
      createdAt: new Date().toISOString()
    };
    room.messages.push(chatMessage);
    if (room.messages.length > 100) room.messages.shift();
    broadcast(room, { type: "chat", message: chatMessage });
    return;
  }

  if (message.type === "signal") {
    if (typeof message.targetId !== "string" || !room.members.has(message.targetId)) {
      sendError(socket, "La personne à joindre n’est plus dans le salon.");
      return;
    }
    if (!message.signal || typeof message.signal !== "object" || Array.isArray(message.signal)) {
      sendError(socket, "Signal d’appel invalide.");
      return;
    }
    const payload = JSON.stringify({
      type: "signal",
      fromId: socket.memberId,
      signal: message.signal
    });
    const target = room.members.get(message.targetId);
    if (target.socket.readyState === WebSocket.OPEN) target.socket.send(payload);
    return;
  }

  if (message.type === "leave_room") {
    leaveRoom(socket);
    return;
  }

  sendError(socket, "Action inconnue.");
}

function checkDonationRateLimit(request, response) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const clientIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : request.socket.remoteAddress;
  const now = Date.now();
  const attempts = (donationAttempts.get(clientIp) || []).filter((time) => now - time < 60_000);
  if (attempts.length >= 5) {
    response.writeHead(429, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Trop de tentatives. Réessaie dans une minute." }));
    return false;
  }
  attempts.push(now);
  donationAttempts.set(clientIp, attempts);
  return true;
}

async function handleDonation(request, response) {
  if (!isAllowedOrigin(request.headers.origin)) {
    response.writeHead(403);
    response.end("Origin not allowed");
    return;
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": request.headers.origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Vary": "Origin"
    });
    response.end();
    return;
  }
  if (request.method !== "POST") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }
  if (!checkDonationRateLimit(request, response)) return;

  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000) {
      response.writeHead(413);
      response.end("Request too large");
      return;
    }
  }

  try {
    const data = JSON.parse(body);
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const amount = data.amount;
    if (data.ageConfirmed !== true) throw new Error("Confirme avoir au moins 15 ans pour continuer.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Indique une adresse e-mail valide.");
    if (typeof amount !== "number" || !Number.isFinite(amount)) throw new Error("Indique un montant valide.");
    const amountInCents = Math.round(amount * 100);
    if (!Number.isSafeInteger(amountInCents) || amountInCents < 1000) throw new Error("Le don minimum est de 10 CAD.");
    if (!process.env.STRIPE_SECRET_KEY || !siteUrl) throw new Error("Le paiement n’est pas encore configuré.");

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      submit_type: "donate",
      locale: "fr",
      customer_email: email.toLowerCase(),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: amountInCents,
          product_data: { name: "Don à ZENYTH_V" }
        }
      }],
      success_url: `${siteUrl.replace(/\/+$/, "")}/dons.html?paiement=merci`,
      cancel_url: `${siteUrl.replace(/\/+$/, "")}/dons.html?paiement=annule`
    });
    response.writeHead(200, {
      "Access-Control-Allow-Origin": request.headers.origin,
      "Content-Type": "application/json",
      "Vary": "Origin"
    });
    response.end(JSON.stringify({ url: checkout.url }));
  } catch (error) {
    response.writeHead(error instanceof SyntaxError ? 400 : 400, {
      "Access-Control-Allow-Origin": request.headers.origin,
      "Content-Type": "application/json",
      "Vary": "Origin"
    });
    response.end(JSON.stringify({ error: error.message }));
  }
}

const server = createServer((request, response) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path === "/healthz" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
    return;
  }
  if (path === "/api/donations") {
    handleDonation(request, response).catch((error) => {
      console.error("Donation checkout failed:", error);
      if (!response.headersSent) response.writeHead(500);
      response.end("Payment service unavailable");
    });
    return;
  }
  response.writeHead(404);
  response.end("Not found");
});

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16_384 });
server.on("upgrade", (request, socket, head) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path !== "/ws" || !isAllowedOrigin(request.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request);
  });
});

webSocketServer.on("connection", (socket) => {
  socket.roomCode = null;
  socket.memberId = null;
  socket.on("message", (raw) => handleSocketMessage(socket, raw));
  socket.on("close", () => leaveRoom(socket));
  socket.on("error", (error) => console.error("WebSocket error:", error.message));
});

setInterval(() => {
  const expiry = Date.now() - maxRoomAgeMs;
  for (const [code, room] of rooms) {
    if (room.createdAt < expiry) {
      for (const member of room.members.values()) safeSend(member.socket, { type: "room_expired" });
      rooms.delete(code);
    }
  }
  for (const [ip, times] of donationAttempts) {
    const fresh = times.filter((time) => Date.now() - time < 60_000);
    if (fresh.length) donationAttempts.set(ip, fresh);
    else donationAttempts.delete(ip);
  }
}, 60_000).unref();

server.listen(port, "0.0.0.0", () => console.log(`Zenyth room server listening on ${port}`));
