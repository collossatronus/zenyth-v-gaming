# Configuration des comptes, appels et dons

Le site reste hébergé comme un site statique. Les appels nécessitent néanmoins Supabase (authentification et fonction serveur) et LiveKit (transport audio/vidéo). Aucun secret LiveKit ne doit être placé dans les fichiers publics du site.

## Comptes email et Discord

1. Crée un projet Supabase et active l’authentification par email et le fournisseur Discord dans **Authentication → Providers**.
2. Dans le portail développeur Discord, configure l’URL de callback OAuth indiquée par Supabase (`https://<PROJECT_REF>.supabase.co/auth/v1/callback`).
3. Autorise l’URL du site et `https://collossatronus.github.io/zenyth-v-gaming/compte.html` dans les URL de redirection Supabase.
4. Renseigne `supabaseUrl` et `supabaseAnonKey` dans `assets/js/config.js`. La clé anon est publique par conception ; n’y ajoute jamais une clé service-role.
5. Pour activer le raccourci de message privé vers Zenyth_V, renseigne `creatorUserId` avec l’UUID du compte Supabase propriétaire, obtenu depuis **Authentication → Users**. L’ID numérique du profil Discord n’est pas l’UUID d’un compte Supabase.

## Appels LiveKit

1. Crée un projet LiveKit Cloud et récupère son URL WebSocket (`wss://…`), sa clé API et son secret API.
2. Installe la CLI Supabase, connecte-la au projet, puis définis les secrets côté serveur :

   ```sh
   supabase secrets set SITE_ORIGIN=https://collossatronus.github.io
   supabase secrets set LIVEKIT_URL=wss://<TON_PROJET>.livekit.cloud
   supabase secrets set LIVEKIT_API_KEY=<CLE_API>
   supabase secrets set LIVEKIT_API_SECRET=<SECRET_API>
   supabase functions deploy create-livekit-token
   ```

3. Renseigne la même URL WebSocket LiveKit dans `liveKitUrl` de `assets/js/config.js`.
4. L’URL du site dans `SITE_ORIGIN` doit correspondre exactement à l’origine du navigateur (sans le chemin `/zenyth-v-gaming`). Les invitations sont des liens de salle : toute personne qui les reçoit peut tenter de rejoindre.

La fonction vérifie la session Supabase et signe les jetons LiveKit côté serveur. Elle n’accepte pas de requêtes provenant d’autres origines que celle configurée.

## Abonnements au site et trophée des 2 000

1. Applique les migrations avec `supabase db push`, notamment `supabase/migrations/20261015000002_creator_subscriptions.sql` et `supabase/migrations/20261015000003_reset_creator_subscriber_count.sql`. Elles créent le compteur public, démarrent le total à zéro et enregistrent des abonnements uniques par compte ; un membre doit être connecté pour s’abonner depuis le bouton Z éclair de l’accueil.
2. Le compteur démarre à zéro et ajoute les comptes abonnés au site. Il n’est pas relié en temps réel à YouTube et ne vérifie pas les abonnements YouTube. Le lien YouTube reste disponible séparément sur l’accueil.
3. Le trophée manette blanche et bleu pastel se débloque lorsque le compteur atteint 2 000. La page affiche aussi la progression restante.
4. La page [moderateurs.html](./moderateurs.html) est réservée visuellement aux comptes ayant le rôle `moderator` ou `owner`. Elle rassemble la file de modération et les consignes ; les décisions restent contrôlées par les politiques RLS et la page [moderation.html](./moderation.html).

## Dons Ko-fi

Renseigne l’URL HTTPS de ta page créateur (`https://ko-fi.com/tonidentifiant`) dans `kofiUrl`, dans `assets/js/config.js`. L’accès au bouton du site requiert une session connectée ; le paiement reste entièrement géré par Ko-fi. Aucun lien n’est affiché tant qu’une URL Ko-fi valide n’est pas configurée.

## Galerie et questions par jeu

1. Applique la migration `supabase/migrations/20261015000000_game_community.sql` au projet Supabase (par exemple avec `supabase db push` après avoir lié le projet). Elle crée les tables avec leurs règles RLS, le stockage privé `game-media` et la limite de 100 Mo par fichier.
2. Le plafond global de téléversement du projet Supabase doit aussi être réglé à au moins 100 Mo. Vérifie que ton offre autorise cette taille et la bande passante vidéo correspondante ; les fichiers ne sont jamais déposés dans le dépôt Git.
3. La page [jeux.html](./jeux.html) relie chaque jeu à son propre onglet de communauté [jeu.html](./jeu.html?jeu=no-mans-sky). Les utilisateurs doivent être connectés pour envoyer une image, une vidéo ou une question. Les contenus sont tous en attente jusqu’à ce qu’un modérateur les approuve.
4. Pour donner les droits de modération, définis le rôle `moderator` dans le champ **app_metadata** du compte Supabase de confiance. N’utilise pas `user_metadata` : chaque utilisateur peut modifier ces données lui-même. Les modérateurs peuvent approuver/refuser les contributions dans la page [moderation.html](./moderation.html). Les médias approuvés sont consultables par tous via des liens temporaires ; le bucket reste privé.

Formats acceptés : JPEG, PNG, WebP, GIF, MP4, WebM et MOV. Les contributions acceptent une légende de 500 caractères, et les questions un titre de 120 caractères et un texte de 2 000 caractères. Les fichiers et textes en attente ne sont pas affichés au public. Configure aussi les URL autorisées pour les pages `jeu.html` et `compte.html` dans **Authentication → URL Configuration**.

## Fil communautaire et messages privés

La migration `supabase/migrations/20261015000000_game_community.sql` crée aussi `community_entries` pour remplacer l’ancien fil local de la page Communauté. Les comptes connectés peuvent publier une question ou une publication ; le propriétaire ou un modérateur valide les entrées depuis [moderation.html](./moderation.html).

La migration `supabase/migrations/20261015000001_private_messages.sql` crée la messagerie de [messages.html](./messages.html). Les messages ne sont lisibles que par les deux membres de la conversation. Les participants peuvent bloquer un compte, ce qui masque la conversation et interdit de nouveaux envois. Aucune fonction d’administration ou de modération ne lit les messages privés.

## Panneau privé propriétaire et gestion des membres

1. Dans Supabase, définis `app_metadata.role` à `owner` pour ton compte propriétaire depuis le tableau de bord (ou en utilisant l’éditeur SQL Supabase) :

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'::jsonb
   where email = 'TON_EMAIL_DE_COMPTE';
   ```

   Remplace l’adresse par celle de ton compte. Déconnecte-toi puis reconnecte-toi pour obtenir le rôle dans la session. N’accorde jamais ce rôle aux modérateurs.

2. Choisis un code secret long et unique (au moins 24 caractères) et enregistre-le uniquement comme secret de la fonction serveur. L’interface d’administration ne le conserve pas :

   ```sh
   supabase secrets set ADMIN_ACCESS_CODE='<CODE_SECRET_LONG_ET_UNIQUE>'
   supabase functions deploy admin-user-management
   ```

3. Dans [admin.html](./admin.html), ton compte propriétaire et ce code sont tous deux vérifiés côté serveur. Le panneau permet de lister les comptes, d’attribuer/retirer le rôle `moderator` et de suspendre/réactiver les comptes. Seul le propriétaire peut gérer ces rôles.
4. Dans [moderation.html](./moderation.html), un compte `moderator` ou `owner` peut approuver/refuser les publications, questions et médias. Ce rôle ne donne pas accès aux comptes à gérer ni aux messages privés.

`SITE_ORIGIN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` doivent être disponibles aux fonctions Supabase ; le secret service-role reste côté serveur. N’inscris ni le code propriétaire ni la clé service-role dans les fichiers du site.
