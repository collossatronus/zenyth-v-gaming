if (document.readyState === "loading") {
  await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
}

const config = window.ZENYTH_CONFIG;
const status = document.getElementById("subscriber-status");
const count = document.getElementById("subscriber-count");
const subscribeButton = document.getElementById("subscribe-button");
const trophy = document.getElementById("subscriber-trophy");
const progress = document.getElementById("subscriber-progress");
const milestoneStatus = document.getElementById("subscriber-milestone-status");
const milestone = 2000;
let client;
let session;
let subscribed = false;

function renderCount(value) {
  const subscriberCount = Number(value);
  if (!Number.isSafeInteger(subscriberCount) || subscriberCount < 0) {
    throw new Error("Le compteur a renvoyé une valeur invalide.");
  }

  count.textContent = new Intl.NumberFormat("fr-FR").format(subscriberCount);
  trophy.classList.toggle("is-unlocked", subscriberCount >= milestone);
  trophy.setAttribute("aria-label", subscriberCount >= milestone
    ? "Trophée manette des 2 000 abonnés débloqué"
    : "Trophée manette verrouillé jusqu’à 2 000 abonnés");
  progress.value = Math.min(subscriberCount, milestone);
  milestoneStatus.textContent = subscriberCount >= milestone
    ? "Trophée des 2 000 abonnés débloqué !"
    : `Encore ${new Intl.NumberFormat("fr-FR").format(milestone - subscriberCount)} pour débloquer le trophée.`;
}

async function refreshCount() {
  const { data, error } = await client.rpc("zenyth_subscriber_count");
  if (error) throw error;
  renderCount(data);
}

async function refreshSubscription() {
  if (!session) {
    subscribed = false;
    subscribeButton.textContent = "Connecte-toi pour t’abonner";
    subscribeButton.disabled = false;
    return;
  }

  if (session.user.app_metadata?.role === "owner") {
    subscribed = false;
    subscribeButton.textContent = "Compte créateur";
    subscribeButton.disabled = true;
    return;
  }

  const { data, error } = await client.from("creator_subscriptions")
    .select("subscriber_id")
    .eq("subscriber_id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  subscribed = Boolean(data);
  subscribeButton.textContent = subscribed ? "Abonné ✓ · Se désabonner" : "S’abonner à Zenyth_V";
  subscribeButton.disabled = false;
}

subscribeButton.addEventListener("click", async () => {
  if (!session) {
    window.location.assign("compte.html");
    return;
  }

  subscribeButton.disabled = true;
  status.textContent = subscribed ? "Annulation de l’abonnement…" : "Enregistrement de l’abonnement…";
  try {
    if (subscribed) {
      const { error } = await client.from("creator_subscriptions")
        .delete()
        .eq("subscriber_id", session.user.id);
      if (error) throw error;
      status.textContent = "Tu n’es plus abonné à Zenyth_V.";
    } else {
      const { error } = await client.from("creator_subscriptions")
        .insert({ subscriber_id: session.user.id });
      if (error) throw error;
      status.textContent = "Merci pour ton abonnement à Zenyth_V !";
    }
    await refreshSubscription();
    await refreshCount();
  } catch (error) {
    status.textContent = `Impossible de modifier l’abonnement : ${error.message}`;
    subscribeButton.disabled = false;
  }
});

async function initialize() {
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    status.textContent = "Le compteur démarre à zéro. Configure Supabase pour activer les abonnements et le compteur partagé.";
    subscribeButton.disabled = true;
    subscribeButton.textContent = "Abonnement bientôt disponible";
    return;
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    client = createClient(config.supabaseUrl, config.supabaseAnonKey);
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    session = data.session;
    await Promise.all([refreshCount(), refreshSubscription()]);
    status.textContent = session?.user.app_metadata?.role === "owner"
      ? "Le compte propriétaire ne compte pas comme un abonnement de membre."
      : session
        ? "Ton abonnement au site est géré avec ton compte."
        : "Crée un compte ou connecte-toi pour t’abonner sur le site. Tu peux aussi t’abonner directement sur YouTube.";
    client.auth.onAuthStateChange((event, nextSession) => {
      session = nextSession;
      if (event === "SIGNED_OUT") {
        subscribed = false;
        subscribeButton.textContent = "Connecte-toi pour t’abonner";
        subscribeButton.disabled = false;
        status.textContent = "Connecte-toi pour t’abonner sur le site.";
      } else if (event === "SIGNED_IN") {
        window.setTimeout(async () => {
          try {
            await refreshSubscription();
            status.textContent = session.user.app_metadata?.role === "owner"
              ? "Le compte propriétaire ne compte pas comme un abonnement de membre."
              : "Ton abonnement au site est géré avec ton compte.";
          } catch (error) {
            status.textContent = `Impossible de vérifier l’abonnement : ${error.message}`;
          }
        }, 0);
      }
    });
  } catch (error) {
    status.textContent = `Compteur indisponible : ${error.message}`;
    subscribeButton.disabled = true;
  }
}

initialize();
