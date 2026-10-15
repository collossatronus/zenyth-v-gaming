if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime"
]);
const GAME_SLUGS = new Set(window.ZENYTH_GAMES.map((game) => game.slug));
const config = window.ZENYTH_CONFIG;
const params = new URLSearchParams(window.location.search);
const gameSlug = params.get("jeu");
const game = window.ZENYTH_GAMES.find((item) => item.slug === gameSlug);
const status = document.getElementById("game-status");
const mediaList = document.getElementById("game-media-list");
const questionList = document.getElementById("game-question-list");
const mediaForm = document.getElementById("game-media-form");
const questionForm = document.getElementById("game-question-form");
const loginLink = document.getElementById("game-login-link");
const questionLoginLink = document.getElementById("question-login-link");
let client;
let session;

document.querySelector("[data-year]").textContent = new Date().getFullYear();

function displayAuthor(user) {
  const metadata = user.user_metadata || {};
  return String(metadata.full_name || metadata.name || metadata.custom_claims?.global_name || "Membre de la communauté").slice(0, 60);
}

function showMessage(container, text, className = "game-empty") {
  const message = document.createElement("p");
  message.className = className;
  message.textContent = text;
  container.replaceChildren(message);
}

function setPostingEnabled(enabled) {
  mediaForm.querySelectorAll("input,textarea,button").forEach((control) => { control.disabled = !enabled; });
  questionForm.querySelectorAll("input,textarea,button").forEach((control) => { control.disabled = !enabled; });
  loginLink.hidden = enabled;
  questionLoginLink.hidden = enabled;
}

function updateTab(selected) {
  document.querySelectorAll("[data-game-tab]").forEach((button) => {
    const active = button.dataset.gameTab === selected;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    document.getElementById(button.getAttribute("aria-controls")).hidden = !active;
  });
}

async function loadMedia() {
  const { data, error } = await client
    .from("game_media")
    .select("id, user_id, author_name, storage_path, media_type, caption, created_at")
    .eq("game_slug", gameSlug)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  if (!data.length) {
    showMessage(mediaList, "Pas encore de partage approuvé pour ce jeu. Envoie le premier !");
    return;
  }

  const cards = await Promise.all(data.map(async (item) => {
    const { data: signedFile, error: fileError } = await client.storage
      .from("game-media")
      .createSignedUrl(item.storage_path, 3600);
    if (fileError) throw fileError;

    const card = document.createElement("article");
    card.className = "game-media-card";
    const author = document.createElement("p");
    author.className = "game-media-author";
    author.textContent = `${item.author_name} · ${new Date(item.created_at).toLocaleDateString("fr-FR")}`;
    let media;
    if (item.media_type === "video") {
      media = document.createElement("video");
      media.controls = true;
      media.preload = "metadata";
      media.playsInline = true;
    } else {
      media = document.createElement("img");
      media.alt = item.caption;
      media.loading = "lazy";
    }
    media.src = signedFile.signedUrl;
    const caption = document.createElement("p");
    caption.className = "game-media-caption";
    caption.textContent = item.caption;
    card.append(media, author, caption);
    if (session && item.user_id !== session.user.id) {
      const contact = document.createElement("a");
      contact.className = "game-contact-link";
      contact.href = `messages.html?dest=${encodeURIComponent(item.user_id)}&nom=${encodeURIComponent(item.author_name)}`;
      contact.textContent = "Envoyer un message privé";
      card.append(contact);
    }
    return card;
  }));
  mediaList.replaceChildren(...cards);
}

async function loadQuestions() {
  const { data, error } = await client
    .from("game_questions")
    .select("id, user_id, author_name, title, body, created_at")
    .eq("game_slug", gameSlug)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!data.length) {
    showMessage(questionList, "Aucune question approuvée pour le moment. Tu peux lancer la discussion.");
    return;
  }

  const cards = data.map((question) => {
    const card = document.createElement("article");
    card.className = "game-question-card";
    const header = document.createElement("div");
    header.className = "game-question-header";
    const author = document.createElement("span");
    author.textContent = question.author_name;
    const date = document.createElement("time");
    date.dateTime = question.created_at;
    date.textContent = new Date(question.created_at).toLocaleDateString("fr-FR");
    header.append(author, date);
    const title = document.createElement("h3");
    title.textContent = question.title;
    const body = document.createElement("p");
    body.textContent = question.body;
    card.append(header, title, body);
    if (session && question.user_id !== session.user.id) {
      const contact = document.createElement("a");
      contact.className = "game-contact-link";
      contact.href = `messages.html?dest=${encodeURIComponent(question.user_id)}&nom=${encodeURIComponent(question.author_name)}`;
      contact.textContent = "Envoyer un message privé";
      card.append(contact);
    }
    return card;
  });
  questionList.replaceChildren(...cards);
}

async function refreshContent() {
  status.textContent = "Chargement des partages et des questions…";
  try {
    await Promise.all([loadMedia(), loadQuestions()]);
    status.textContent = session
      ? "Tu es connecté. Tes contributions seront visibles après validation."
      : "Les publications et questions sont publiques après validation. Connecte-toi pour participer.";
  } catch (error) {
    status.textContent = `Chargement impossible : ${error.message}`;
  }
}

function extensionFor(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]{1,8}$/.test(extension)) return extension;
  return file.type.startsWith("image/") ? "jpg" : "mp4";
}

mediaForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || !session) {
    status.textContent = "Connecte-toi pour envoyer une photo ou une vidéo.";
    return;
  }
  const file = document.getElementById("game-media-file").files?.[0];
  const caption = document.getElementById("game-media-caption").value.trim();
  if (!file || !caption) {
    status.textContent = "Choisis un fichier et ajoute une description.";
    return;
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    status.textContent = "Formats acceptés : JPEG, PNG, WebP, GIF, MP4, WebM ou MOV.";
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    status.textContent = "Ce fichier dépasse la limite de 100 Mo.";
    return;
  }

  const path = `${session.user.id}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const mediaType = file.type.startsWith("image/") ? "image" : "video";
  const submit = mediaForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = "Envoi du fichier… Laisse cette page ouverte jusqu’à la fin du transfert.";
  let uploadSucceeded = false;
  try {
    const { error: uploadError } = await client.storage.from("game-media").upload(path, file, {
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw uploadError;
    uploadSucceeded = true;

    const { error: recordError } = await client.from("game_media").insert({
      game_slug: gameSlug,
      user_id: session.user.id,
      author_name: displayAuthor(session.user),
      storage_path: path,
      media_type: mediaType,
      caption
    });
    if (recordError) throw recordError;
    mediaForm.reset();
    status.textContent = "Merci ! Ta contribution est en attente de validation avant publication.";
  } catch (error) {
    if (uploadSucceeded) {
      const { error: cleanupError } = await client.storage.from("game-media").remove([path]);
      if (cleanupError) console.error("Unable to remove an unregistered game upload:", cleanupError);
    }
    status.textContent = `Envoi impossible : ${error.message}`;
  } finally {
    submit.disabled = !session;
  }
});

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || !session) {
    status.textContent = "Connecte-toi pour poser une question.";
    return;
  }
  const title = document.getElementById("game-question-title").value.trim();
  const body = document.getElementById("game-question-body").value.trim();
  const submit = questionForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = "Envoi de ta question…";
  try {
    const { error } = await client.from("game_questions").insert({
      game_slug: gameSlug,
      user_id: session.user.id,
      author_name: displayAuthor(session.user),
      title,
      body
    });
    if (error) throw error;
    questionForm.reset();
    status.textContent = "Ta question est en attente de validation avant publication.";
  } catch (error) {
    status.textContent = `Envoi impossible : ${error.message}`;
  } finally {
    submit.disabled = !session;
  }
});

document.querySelectorAll("[data-game-tab]").forEach((button, index, buttons) => {
  button.addEventListener("click", () => updateTab(button.dataset.gameTab));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = buttons[(index + offset + buttons.length) % buttons.length];
    updateTab(next.dataset.gameTab);
    next.focus();
  });
});

if (!game || !GAME_SLUGS.has(gameSlug)) {
  document.getElementById("game-title").textContent = "Jeu introuvable";
  document.getElementById("game-lede").textContent = "Choisis un jeu dans le catalogue pour consulter ses captures et poser une question.";
  document.getElementById("game-community").hidden = true;
} else {
  document.title = `${game.name} · Communauté | ZENYTH_V Gaming`;
  document.querySelector('meta[name="description"]').content = `Partage des captures et vidéos de ${game.name}, ou pose une question à la communauté ZENYTH_V.`;
  document.getElementById("game-title").textContent = game.name;
  document.getElementById("game-lede").textContent = `Partage tes captures et vidéos de ${game.name} ou pose une question à la communauté. Les publications sont visibles après validation.`;
  document.getElementById("game-breadcrumb").textContent = game.name;

  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    setPostingEnabled(false);
    showMessage(mediaList, "Le service de publication doit être configuré avant de charger les partages.");
    showMessage(questionList, "Le service de publication doit être configuré avant de charger les questions.");
    status.textContent = "Configure Supabase et applique la migration décrite dans CONFIGURATION.md pour activer cette page.";
  } else {
    import("https://esm.sh/@supabase/supabase-js@2")
      .then(async ({ createClient }) => {
        client = createClient(config.supabaseUrl, config.supabaseAnonKey);
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        session = data.session;
        setPostingEnabled(Boolean(session));
        await refreshContent();
        client.auth.onAuthStateChange((_event, nextSession) => {
          session = nextSession;
          setPostingEnabled(Boolean(session));
          refreshContent();
        });
      })
      .catch((error) => {
        setPostingEnabled(false);
        status.textContent = `Connexion au service communautaire impossible : ${error.message}`;
        showMessage(mediaList, "Les partages sont indisponibles pour le moment.");
        showMessage(questionList, "Les questions sont indisponibles pour le moment.");
      });
  }
}
