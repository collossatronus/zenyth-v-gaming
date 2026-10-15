const tiktokCount = document.getElementById("tiktok-follower-count");
const twitchCount = document.getElementById("twitch-follower-count");

try {
  const tiktok = Number(tiktokCount.dataset.count);
  const twitch = Number(twitchCount.dataset.count);
  if (!Number.isSafeInteger(tiktok) || tiktok < 0 || !Number.isSafeInteger(twitch) || twitch < 0) {
    throw new Error("Les nombres affichés pour TikTok et Twitch doivent être des entiers positifs ou nuls.");
  }

  const format = (value) => new Intl.NumberFormat("fr-FR").format(value);
  tiktokCount.textContent = format(tiktok);
  twitchCount.textContent = format(twitch);
} catch (error) {
  tiktokCount.textContent = "—";
  twitchCount.textContent = "—";
  console.error(error);
}
