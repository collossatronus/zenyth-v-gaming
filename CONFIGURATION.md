# Auto-héberger les appels et les messages

Les visiteurs n’ont besoin d’aucun compte, mot de passe ou réglage : ils créent une salle (avec un code généré automatiquement ou choisi) puis partagent le code. Le propriétaire du site doit toutefois mettre le serveur Node.js en ligne une seule fois; un site statique GitHub Pages ne peut pas, à lui seul, créer les salons ni transmettre les informations d’appel. Aucun service tiers d’authentification ou de signalisation n’est nécessaire.

## Mettre le serveur en ligne sur Railway

Le dépôt contient `server/railway.json` pour démarrer le service Node.js 20 et vérifier son état avec `/healthz`.

1. Connecte le dépôt GitHub `collossatronus/zenyth-v-gaming` à un nouveau projet Railway et sélectionne la branche `main`.
2. Dans les réglages du service, définis **Root Directory** sur `/server`. Railway utilisera `server/package.json` et sa configuration Railway.
3. Dans les variables du service Railway, ajoute `SITE_ORIGIN=https://collossatronus.github.io`. Aucun secret n’est requis pour les appels.
4. Déploie le service, puis active un domaine public dans **Settings → Networking → Public Networking**. Railway fournit une adresse `*.up.railway.app`; le service fournit `/healthz` pour vérifier qu’il fonctionne.
5. Dans `assets/js/config.js`, renseigne l’URL WebSocket Railway en remplaçant `https://` par `wss://`, par exemple `roomServerUrl: "wss://nom-du-service.up.railway.app"`. Publie ensuite les changements du site statique.

`SITE_ORIGIN` doit correspondre à l’origine du site dans le navigateur (sans le chemin `/zenyth-v-gaming`). En développement local, le serveur autorise aussi les origines localhost.

Les visiteurs n’ont besoin que du code choisi par le créateur du salon. Le même code sert pour le chat et l’appel. Un code ne peut être utilisé que par un salon actif à la fois. Les messages sont temporaires : seuls les 100 derniers sont gardés en mémoire; ils sont perdus au redémarrage du serveur ou quand le salon se vide. Les salons expirent après 12 heures.

## Limites des appels et de capacité

L’audio/vidéo utilise WebRTC directement entre les navigateurs; le serveur ne relaie pas la vidéo. Sans serveur TURN que tu héberges toi-même, certains routeurs, réseaux mobiles ou pare-feu empêcheront l’appel de se connecter. Les personnes d’un même réseau ont généralement plus de chances de se joindre. La qualité et le nombre d’appels simultanés dépendent des appareils, de la connexion Internet et des ressources du serveur. Aucun service auto-hébergé ne peut garantir un usage gratuit, illimité et sans restrictions.

## Dons par carte

Les paiements sont indépendants des appels et messages. Pour activer les dons, définis `STRIPE_SECRET_KEY` et `SITE_URL` dans l’environnement du serveur. Le formulaire transmet le montant, l’e-mail et la confirmation d’âge à `/api/donations`; Stripe Checkout recueille les données de carte, qui ne transitent pas par le site. Le formulaire impose un minimum de 10 CAD et une confirmation d’âge de 15 ans.
