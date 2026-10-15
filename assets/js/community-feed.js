if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const config = window.ZENYTH_CONFIG;
const form = document.getElementById("community-form");
const list = document.getElementById("entry-list");
const status = document.getElementById("community-status");
const loginLink = document.getElementById("community-login-link");
let client;
let session;
let activeFilter = "all";

document.querySelector("[data-year]").textContent = new Date().getFullYear();

function authorName(user) {
  const metadata = user.user_metadata || {};
  return String(metadata.full_name || metadata.name || "Membre de la communauté").slice(0, 60);
}

function showEmpty(text) {
  const empty = document.createElement("p");
  empty.className = "entry-empty";
  empty.textContent = text;
  list.replaceChildren(empty);
}

function setFormEnabled(enabled) {
  form.querySelectorAll("input,select,textarea,button").forEach((control) => { control.disabled = !enabled; });
  loginLink.hidden = enabled;
}

async function renderEntries() {
  if (!client) return;
  const query = client.from("community_entries")
    .select("id, user_id, author_name, entry_type, title, body, created_at")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);
  if (activeFilter !== "all") query.eq("entry_type", activeFilter);
  const { data, error } = await query;
  if (error) {
    showEmpty(`Impossible de charger le fil : ${error.message}`);
    return;
  }
  if (!data.length) {
    showEmpty(activeFilter === "all" ? "Le fil est calme pour le moment. Lance la conversation !" : "Aucun message approuvé dans cette catégorie.");
    return;
  }

  const cards = data.map((entry) => {
    const card = document.createElement("article");
    card.className = "entry-card";
    const header = document.createElement("div");
    header.className = "entry-card-top";
    const type = document.createElement("span");
    type.className = "entry-type";
    type.textContent = entry.entry_type === "question" ? "Question" : "Publication";
    const byline = document.createElement("span");
    byline.textContent = `${entry.author_name} · ${new Date(entry.created_at).toLocaleString("fr-FR")}`;
    header.append(type, byline);
    const title = document.createElement("h3");
    title.textContent = entry.title;
    const body = document.createElement("p");
    body.textContent = entry.body;
    card.append(header, title, body);
    if (session && entry.user_id !== session.user.id) {
      const contact = document.createElement("a");
      contact.className = "game-contact-link";
      contact.href = `messages.html?dest=${encodeURIComponent(entry.user_id)}&nom=${encodeURIComponent(entry.author_name)}`;
      contact.textContent = "Envoyer un message privé";
      card.append(contact);
    }
    return card;
  });
  list.replaceChildren(...cards);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client || !session) {
    status.textContent = "Connecte-toi pour publier dans la communauté.";
    return;
  }

  const type = document.getElementById("entry-type").value;
  const title = document.getElementById("entry-title").value.trim();
  const body = document.getElementById("entry-body").value.trim();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = "Envoi de ta contribution…";
  try {
    const { error } = await client.from("community_entries").insert({
      user_id: session.user.id,
      author_name: authorName(session.user),
      entry_type: type,
      title,
      body
    });
    if (error) throw error;
    form.reset();
    status.textContent = "Merci ! Ta contribution sera visible après validation par la modération.";
  } catch (error) {
    status.textContent = `Publication impossible : ${error.message}`;
  } finally {
    submit.disabled = !session;
  }
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
    renderEntries();
  });
});

if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
  setFormEnabled(false);
  status.textContent = "Configure Supabase pour activer les publications partagées.";
  showEmpty("Le fil partagé sera disponible après la configuration de Supabase.");
} else {
  import("https://esm.sh/@supabase/supabase-js@2")
    .then(async ({ createClient }) => {
      client = createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session;
      setFormEnabled(Boolean(session));
      status.textContent = session
        ? "Connecté. Tes publications sont vérifiées avant leur affichage public."
        : "Les publications sont publiques après validation. Connecte-toi pour participer.";
      await renderEntries();
      client.auth.onAuthStateChange(async (_event, nextSession) => {
        session = nextSession;
        setFormEnabled(Boolean(session));
        status.textContent = session
          ? "Connecté. Tes publications sont vérifiées avant leur affichage public."
          : "Les publications sont publiques après validation. Connecte-toi pour participer.";
        await renderEntries();
      });
    })
    .catch((error) => {
      setFormEnabled(false);
      status.textContent = `Service communautaire indisponible : ${error.message}`;
      showEmpty("Le fil communautaire ne peut pas être chargé pour le moment.");
    });
}
