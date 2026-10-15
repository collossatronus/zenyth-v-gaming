if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const config = window.ZENYTH_CONFIG;
const status = document.getElementById("moderator-status");
const workspace = document.getElementById("moderator-workspace");
const loginLink = document.getElementById("moderator-login-link");
document.querySelector("[data-year]").textContent = new Date().getFullYear();

async function initialize() {
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    status.textContent = "La connexion doit être configurée avant d’ouvrir l’espace modérateurs.";
    loginLink.hidden = false;
    return;
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const role = data.session?.user.app_metadata?.role;
    if (role !== "moderator" && role !== "owner") {
      status.textContent = data.session
        ? "Accès réservé aux comptes auxquels le propriétaire a attribué le rôle modérateur."
        : "Connecte-toi avec le compte que le propriétaire a désigné comme modérateur.";
      loginLink.hidden = false;
      return;
    }

    workspace.hidden = false;
    status.textContent = role === "owner"
      ? "Accès propriétaire confirmé. Tu peux aussi gérer les rôles dans le panneau propriétaire."
      : "Accès modérateur confirmé. Merci d’aider à garder la communauté accueillante.";
    if (role === "owner") document.getElementById("moderator-admin-link").hidden = false;
  } catch (error) {
    status.textContent = `Vérification des droits impossible : ${error.message}`;
    loginLink.hidden = false;
  }
}

initialize();
