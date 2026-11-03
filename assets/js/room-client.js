export default class RoomClient extends EventTarget {
  constructor(serverUrl) {
    super();
    if (!serverUrl) throw new Error("L’URL du serveur doit être configurée.");
    const url = new URL(serverUrl);
    if (url.protocol !== "wss:" && url.protocol !== "ws:") {
      throw new Error("Le serveur doit utiliser une URL WebSocket (wss://).");
    }
    url.pathname = "/ws";
    url.search = "";
    this.socket = new WebSocket(url);
    this.pending = null;
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "error" && this.pending) {
        this.pending.reject(new Error(message.message));
        this.pending = null;
      } else if (this.pending?.responseType === message.type) {
        this.pending.resolve(message);
        this.pending = null;
      }
      this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
    });
    this.socket.addEventListener("close", () => {
      if (this.pending) {
        this.pending.reject(new Error("La connexion au serveur a été interrompue."));
        this.pending = null;
      }
      this.dispatchEvent(new Event("closed"));
    });
    this.socket.addEventListener("error", () => {
      this.dispatchEvent(new CustomEvent("connection_error", {
        detail: { message: "Impossible de joindre le serveur de salons." }
      }));
    });
  }

  async ready() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    if (this.socket.readyState === WebSocket.CLOSING || this.socket.readyState === WebSocket.CLOSED) {
      throw new Error("Le serveur de salons est indisponible.");
    }
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        this.socket.removeEventListener("open", onOpen);
        this.socket.removeEventListener("error", onError);
        this.socket.removeEventListener("close", onClose);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Le serveur de salons est indisponible."));
      };
      const onClose = () => {
        cleanup();
        reject(new Error("La connexion au serveur a été fermée."));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Le serveur de salons ne répond pas."));
      }, 15000);
      this.socket.addEventListener("open", onOpen, { once: true });
      this.socket.addEventListener("error", onError, { once: true });
      this.socket.addEventListener("close", onClose, { once: true });
    });
  }

  async request(type, responseType, payload = {}) {
    if (this.pending) throw new Error("Une demande est déjà en cours.");
    await this.ready();
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, responseType };
      try {
        this.socket.send(JSON.stringify({ type, ...payload }));
      } catch (error) {
        this.pending = null;
        reject(error);
      }
    });
  }

  createRoom(roomCode) {
    return this.request("create_room", "room_created", { roomCode: roomCode.trim().toUpperCase() });
  }

  joinRoom(roomCode) {
    return this.request("join_room", "room_joined", { roomCode: roomCode.trim().toUpperCase() });
  }

  chat(text) {
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error("La connexion au salon est fermée.");
    this.socket.send(JSON.stringify({ type: "chat", text }));
  }

  signal(targetId, signal) {
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error("La connexion au salon est fermée.");
    this.socket.send(JSON.stringify({ type: "signal", targetId, signal }));
  }

  leave() {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "leave_room" }));
  }

  close() {
    this.socket.close();
  }
}
