if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const config = window.ZENYTH_CONFIG;
const status = document.getElementById("messages-status");
const conversationList = document.getElementById("conversation-list");
const messageList = document.getElementById("message-list");
const messageForm = document.getElementById("message-form");
const sendButton = messageForm.querySelector('button[type="submit"]');
const loginPrompt = document.getElementById("messages-login-prompt");
const recipientName = document.getElementById("recipient-name");
const userIdInput = document.getElementById("recipient-id");
const blockedToggle = document.getElementById("toggle-blocked");
const blockedPanel = document.getElementById("blocked-panel");
const blockedList = document.getElementById("blocked-list");
let client;
let session;
let activeConversation;
let activeOtherUser;
let activeOtherName = "";
let pollingTimer;

document.querySelector("[data-year]").textContent = new Date().getFullYear();

function displayName(user) {
  const metadata = user.user_metadata || {};
  return String(metadata.full_name || metadata.name || "Membre de la communauté").slice(0, 60);
}

function setSignedIn(enabled) {
  userIdInput.disabled = !enabled;
  sendButton.disabled = !enabled || !activeConversation;
  loginPrompt.hidden = enabled;
  blockedToggle.hidden = !enabled;
}

function renderEmpty(container, text) {
  const empty = document.createElement("p");
  empty.className = "game-empty";
  empty.textContent = text;
  container.replaceChildren(empty);
}

function otherMember(conversation) {
  return conversation.member_one === session.user.id ? conversation.member_two : conversation.member_one;
}

function memberName(userId) {
  if (userId === config?.creatorUserId) return "Zenyth_V";
  if (userId === activeOtherUser && activeOtherName) return activeOtherName;
  return "Membre";
}

function startPolling() {
  if (pollingTimer) return;
  pollingTimer = window.setInterval(async () => {
    try {
      await loadConversations();
      if (activeConversation) await loadMessages(activeConversation);
    } catch (error) {
      status.textContent = `Actualisation impossible : ${error.message}`;
    }
  }, 6000);
}

function clearSignedOutView() {
  session = null;
  activeConversation = null;
  activeOtherUser = null;
  activeOtherName = "";
  window.clearInterval(pollingTimer);
  pollingTimer = null;
  conversationList.replaceChildren();
  messageList.replaceChildren();
  blockedList.replaceChildren();
  blockedPanel.hidden = true;
  recipientName.textContent = "Choisis une conversation";
  document.getElementById("block-member").hidden = true;
  setSignedIn(false);
}

async function loadMessages(conversationId) {
  const { data, error } = await client
    .from("private_messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  if (!data.length) {
    renderEmpty(messageList, "Conversation ouverte. Envoie le premier message.");
    return;
  }

  const cards = data.map((item) => {
    const article = document.createElement("article");
    article.className = item.sender_id === session.user.id ? "private-message mine" : "private-message";
    const author = document.createElement("strong");
    author.textContent = item.sender_id === session.user.id ? "Toi" : memberName(item.sender_id);
    const time = document.createElement("time");
    time.dateTime = item.created_at;
    time.textContent = new Date(item.created_at).toLocaleString("fr-FR");
    const header = document.createElement("div");
    header.className = "private-message-header";
    header.append(author, time);
    const body = document.createElement("p");
    body.textContent = item.body;
    article.append(header, body);
    return article;
  });
  messageList.replaceChildren(...cards);
  messageList.scrollTop = messageList.scrollHeight;
}

async function loadConversations() {
  const { data, error } = await client
    .from("private_conversations")
    .select("id, member_one, member_two, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!data.length) {
    renderEmpty(conversationList, "Tes conversations privées apparaîtront ici.");
    return;
  }

  const rows = data.map((conversation) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    button.setAttribute("aria-current", String(conversation.id === activeConversation));
    const name = document.createElement("strong");
    name.textContent = memberName(otherMember(conversation));
    const date = document.createElement("span");
    date.textContent = new Date(conversation.created_at).toLocaleDateString("fr-FR");
    button.append(name, date);
    button.addEventListener("click", () => openConversation(conversation));
    return button;
  });
  conversationList.replaceChildren(...rows);
}

async function openConversation(conversation) {
  activeConversation = conversation.id;
  activeOtherUser = otherMember(conversation);
  if (activeOtherUser !== config?.creatorUserId) activeOtherName = "";
  recipientName.textContent = memberName(activeOtherUser);
  sendButton.disabled = false;
  document.getElementById("block-member").hidden = false;
  try {
    await loadMessages(conversation.id);
    await loadConversations();
  } catch (error) {
    status.textContent = `Impossible de charger la conversation : ${error.message}`;
  }
}

async function startConversation(targetId, targetName) {
  if (!session) {
    status.textContent = "Connecte-toi pour démarrer une conversation privée.";
    return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)) {
    status.textContent = "L’identifiant du destinataire n’est pas valide.";
    return;
  }
  if (targetId === session.user.id) {
    status.textContent = "Tu ne peux pas démarrer une conversation avec ton propre compte.";
    return;
  }

  const [memberOne, memberTwo] = [session.user.id, targetId].sort();
  status.textContent = "Ouverture de la conversation privée…";
  try {
    const { error: createError } = await client.from("private_conversations").upsert({
      member_one: memberOne,
      member_two: memberTwo,
      created_by: session.user.id
    }, { onConflict: "member_one,member_two", ignoreDuplicates: true });
    if (createError) throw createError;

    const { data, error } = await client.from("private_conversations")
      .select("id, member_one, member_two, created_at")
      .eq("member_one", memberOne)
      .eq("member_two", memberTwo)
      .single();
    if (error) throw error;
    activeOtherName = targetName.slice(0, 60);
    await openConversation(data);
    status.textContent = "Conversation privée. Seuls ses deux participants peuvent lire les messages.";
  } catch (error) {
    status.textContent = `Impossible d’ouvrir la conversation : ${error.message}. Le compte n’existe peut-être pas ou a bloqué les messages.`;
  }
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!session || !activeConversation) return;
  const input = document.getElementById("message-body");
  const body = input.value.trim();
  if (!body || body.length > 2000) {
    status.textContent = "Le message doit contenir entre 1 et 2 000 caractères.";
    return;
  }
  sendButton.disabled = true;
  try {
    const { error } = await client.from("private_messages").insert({
      conversation_id: activeConversation,
      sender_id: session.user.id,
      body
    });
    if (error) throw error;
    input.value = "";
    await loadMessages(activeConversation);
    status.textContent = "Message envoyé.";
  } catch (error) {
    status.textContent = `Message non envoyé : ${error.message}`;
  } finally {
    sendButton.disabled = false;
  }
});

document.getElementById("start-to-creator").addEventListener("click", () => {
  const creatorId = config?.creatorUserId;
  if (!creatorId) {
    status.textContent = "L’identifiant de contact du propriétaire n’est pas configuré.";
    return;
  }
  startConversation(creatorId, "Zenyth_V");
});

document.getElementById("start-recipient-form").addEventListener("submit", (event) => {
  event.preventDefault();
  startConversation(userIdInput.value.trim(), "Membre");
});

document.getElementById("block-member").addEventListener("click", async () => {
  if (!session || !activeOtherUser) return;
  if (!window.confirm(`Bloquer ${memberName(activeOtherUser)} ? Cette personne ne pourra plus t’écrire et la conversation sera masquée.`)) return;
  const { error } = await client.from("private_message_blocks").insert({
    blocker_id: session.user.id,
    blocked_id: activeOtherUser
  });
  if (error) {
    status.textContent = `Blocage impossible : ${error.message}`;
    return;
  }
  activeConversation = null;
  activeOtherUser = null;
  activeOtherName = "";
  recipientName.textContent = "Choisis une conversation";
  messageList.replaceChildren();
  sendButton.disabled = true;
  document.getElementById("block-member").hidden = true;
  status.textContent = "Compte bloqué. Cette conversation privée est masquée.";
  await loadConversations();
});

blockedToggle.addEventListener("click", async () => {
  blockedPanel.hidden = !blockedPanel.hidden;
  if (blockedPanel.hidden || !client || !session) return;
  const { data, error } = await client.from("private_message_blocks")
    .select("blocked_id, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    status.textContent = `Impossible de charger les comptes bloqués : ${error.message}`;
    return;
  }
  if (!data.length) {
    renderEmpty(blockedList, "Tu n’as bloqué aucun compte.");
    return;
  }
  const entries = data.map((item) => {
    const row = document.createElement("div");
    row.className = "blocked-account-row";
    const label = document.createElement("span");
    label.textContent = item.blocked_id === config?.creatorUserId ? "Zenyth_V" : `Membre · ${item.blocked_id}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button secondary";
    button.textContent = "Débloquer";
    button.addEventListener("click", async () => {
      button.disabled = true;
      const { error: unblockError } = await client.from("private_message_blocks")
        .delete()
        .eq("blocked_id", item.blocked_id);
      if (unblockError) {
        status.textContent = `Déblocage impossible : ${unblockError.message}`;
        button.disabled = false;
        return;
      }
      row.remove();
      status.textContent = "Compte débloqué. Vous pouvez reprendre la conversation.";
      await loadConversations();
      if (!blockedList.children.length) renderEmpty(blockedList, "Tu n’as bloqué aucun compte.");
    });
    row.append(label, button);
    return row;
  });
  blockedList.replaceChildren(...entries);
});

async function initialize() {
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    setSignedIn(false);
    status.textContent = "Le service de messagerie doit être configuré pour ouvrir les messages.";
    return;
  }
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    client = createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    session = data.session;
    setSignedIn(Boolean(session));
    client.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        clearSignedOutView();
        status.textContent = "Déconnecté. Reconnecte-toi pour accéder aux messages.";
        return;
      }
      if (event !== "SIGNED_IN" || !nextSession) return;
      session = nextSession;
      setSignedIn(true);
      status.textContent = "Tes messages privés sont visibles uniquement par toi et ton correspondant.";
      window.setTimeout(async () => {
        try {
          const recipientId = new URLSearchParams(window.location.search).get("dest");
          const recipient = new URLSearchParams(window.location.search).get("nom") || "Membre";
          if (recipientId) await startConversation(recipientId, recipient);
          await loadConversations();
          startPolling();
        } catch (authError) {
          status.textContent = `Impossible de charger les conversations : ${authError.message}`;
        }
      }, 0);
    });
    if (!session) {
      status.textContent = "Connecte-toi pour consulter ou envoyer des messages privés.";
      renderEmpty(conversationList, "Connecte-toi pour consulter tes conversations.");
      renderEmpty(messageList, "Les messages privés ne sont accessibles qu’aux participants connectés.");
      return;
    }

    status.textContent = "Tes messages privés sont visibles uniquement par toi et ton correspondant.";
    const recipientId = new URLSearchParams(window.location.search).get("dest");
    const recipient = new URLSearchParams(window.location.search).get("nom") || "Membre";
    if (recipientId) await startConversation(recipientId, recipient);
    await loadConversations();
    startPolling();
  } catch (error) {
    setSignedIn(false);
    status.textContent = `Messagerie indisponible : ${error.message}`;
  }
}

initialize();
