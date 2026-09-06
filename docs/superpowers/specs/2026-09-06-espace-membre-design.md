# Espace membre FemzLab — design validé

Date : 2026-09-06 · Validé par Femz section par section (identité & Podia, modèle
de données, app & entrées, admin & mise en route). Ce document fait foi pour le
plan d'implémentation.

## 1. Le besoin

Reprendre le dispositif construit pour NéoVision en juillet (profil, messagerie
privée, globe des créateurs) et en faire **la gestion de profil principale des
utilisateurs FemzLab**, disponible depuis toutes les pages du site, avec :
photo de profil, liens, produits achetés, présence sur la carte, DM.

État de départ, vérifié le 2026-09-06 :

- `neovision-platform/worker/` : backend Hono + D1 complet (comptes, session
  JWT cookie, liens magiques, profil géocodé, consentement opt-in, DM, liste
  publique du globe sans email). **Jamais déployé** : aucun Worker
  `neovision`, aucune base D1 sur le compte, aucun DNS `neovision.femzlab.shop`.
  Testé en local (Miniflare) seulement.
- `neovision-platform/web/` : SPA React + Vite + Tailwind, 852 Ko de build,
  DA sombre bleue (`WEBDESIGN.md`) : globe d3-geo (1 025 lignes : clusters,
  recherche → vol animé, plein écran, carte profil ancrée au marqueur, chat
  morph), CardNav avec panneau « Mon espace », DmModal « génie », ConsentModal,
  `i18n.js` FR→EN runtime.
- Manque pour le besoin : produits achetés, stockage d'images (aujourd'hui en
  dataURL dans la base), envoi d'emails (jamais branché), lien Podia.
- Podia n'a **ni API ni webhook** ; créer un compte Podia depuis un backend
  exige l'action Zapier « Sign someone up for a product » (plan Podia Shaker
  + Zapier payant). Non retenu.

## 2. Décisions (par Femz)

| Sujet | Décision |
|---|---|
| Rôle de Podia | Caisse + accès aux cours. **Le site est l'identité.** Le compte Podia se crée tout seul à l'achat et se relie au profil par l'email. |
| Où ça vit | App sombre (DA NéoVision) servie sous **`femzlab.shop/espace`** ; entrée « Mon espace » sur **toutes** les pages du site et sur imfemz.com. |
| Connexion | **Google ou Discord uniquement** (OAuth). Pas d'email de connexion, pas de mot de passe. |
| Qui s'inscrit | **Tout le monde**, achat ou pas. |
| Globe public | **Non** : le globe n'existe que dans l'espace membre. |
| Architecture | **A — un seul Worker** (API + fichiers de l'app), route `femzlab.shop/espace*`, D1 + R2. |
| Persistance | Tout côté serveur, plus de repli localStorage, historique D1 + copie nocturne dans R2. |

## 3. Architecture

```
femzlab.shop (Cloudflare Pages, pages statiques, build.py)
 ├── /api/license/*  → Worker motionlab-license   (existant)
 ├── /api/avis*      → Worker femzlab-avis         (existant)
 └── /espace*        → Worker femzlab-espace       (NOUVEAU)
                        ├── /espace/api/…   API JSON (Hono)
                        ├── /espace/auth/…  OAuth Google / Discord
                        ├── /espace/media/… images servies depuis R2
                        ├── /espace/hooks/… achats depuis la page de remerciement Podia
                        └── /espace/*       SPA React (Workers Static Assets, repli SPA)
     Liaisons : D1 `femzlab-espace-db` · R2 `femzlab-espace-media` · Email Service
     (binding `send_email` vers hello@imfemz.com, déjà vérifié) · cron nocturne.
```

- **Emplacement du code** : `femzlab-shop-front/espace/` avec `worker/` et
  `web/`, copiés depuis `neovision-platform` (qui reste l'historique). Une
  seule source pour le site et son espace membre.
- **Route Workers avant Pages** : même mécanisme que les licences et les avis,
  prouvé en production.
- **Cookie de session** `fz_session` : JWT HS256, 7 jours, `httpOnly`,
  `SameSite=Lax`, `Secure`, `Path=/`, domaine `femzlab.shop` → lisible par le
  Worker depuis n'importe quelle page du site (l'entrée nav appelle
  `/espace/api/me`).
- **Pas de mode démo** : `initSession()` ne retombe plus sur `localStorage`.
  Backend injoignable ⇒ écran d'erreur explicite.

## 4. Identité et liaison Podia

### 4.1 Connexion OAuth

- Fournisseurs : **Google** (`openid email profile`) et **Discord**
  (`identify email`). Échange de code fait par le Worker (fetch), sans
  librairie. `state` aléatoire signé en cookie court (10 min) contre le CSRF ;
  `nonce` pour Google ; email exigé **vérifié** par le fournisseur, sinon refus
  avec message.
- Routes : `GET /espace/auth/:provider` (redirige), `GET
  /espace/auth/:provider/callback` (échange, résout l'identité, pose la
  session, redirige vers `/espace/`), `POST /espace/auth/logout`.
- Résolution : `identities(provider, provider_id)` → utilisateur ; sinon
  `user_emails(email)` → utilisateur existant (on attache la nouvelle
  identité) ; sinon création : `users` + `identities` + `user_emails`
  (`verified_by='oauth'`), avatar initial = photo du fournisseur copiée dans R2.
- Un profil peut porter les deux connexions. Un membre connecté peut
  « Ajouter Discord / Google » depuis Confidentialité (même callback, mode
  attache).
- Fondateur : le premier compte dont l'email ∈ `OWNER_EMAILS`
  (`fraps81@gmail.com`, `hello@imfemz.com`) reçoit `founder=1`.

### 4.2 Achats

- Table `purchases` (email, produit canonique, date, source). Un achat se
  rattache à un membre dès qu'une de ses `user_emails` correspond ; sinon il
  attend, rattaché plus tard (à la connexion, à l'approbation d'une adresse).
- Sources :
  1. **Page de remerciement Podia** : le snippet existant
     (`MotionLAB/license-worker/podia-snippet.html`) est étendu à **tous** les
     produits : il poste `{email, podia_id, page}` vers
     `POST /espace/hooks/checkout` ; le produit est déduit du slug de la page
     (`/motionlab/thanks` → MotionLAB, `/metavision/thanks` → MetaVision…) via
     la table PRODUITS. Requête falsifiable (elle part du navigateur) →
     marquée `source='checkout'`, auditable, mais suffisante : elle ne donne
     accès à aucun contenu, seulement un badge.
  2. **Import CSV** (admin) des exports Podia par produit — idempotent, clé
     (email, produit).
  3. **Admin** : ajout/retrait manuel.
- Table de correspondance produits (nom Podia / slug → nom canonique, badge,
  URL Podia) : **une seule source**, partagée avec `avis-worker` (même map
  PRODUITS étendue des slugs).
- Le service de licences MotionLAB (KV) reste indépendant pour l'instant ;
  rapprochement possible plus tard (hors périmètre).

### 4.3 Email différent entre Google et Podia

- Dans Confidentialité : « Relier une autre adresse » → le membre saisit
  l'email d'achat → `link_requests` (statut `pending`) → **email à
  hello@imfemz.com** via le binding `send_email` (gratuit, vérifié) contenant
  le profil demandeur, l'email demandé, et deux boutons **Approuver / Refuser**
  (liens signés HMAC, à usage unique, 30 jours).
- Approuver ⇒ l'email entre dans `user_emails` (`verified_by='admin'`), les
  achats correspondants se rattachent. Refuser ⇒ statut `denied`, le membre
  voit « refusé ». Même action possible depuis l'admin de l'app.
- Aucun email n'est envoyé au client. Une adresse déjà liée à un autre membre
  est refusée d'office (conflit signalé à Femz).

## 5. Modèle de données (D1)

```sql
users(id, created_at, display_name, name, avatar_key, country, city, lat, lon,
      socials JSON{ig,tt,yt}, reels JSON[{url,thumb_key}] (max 3), lang,
      founder, visible DEFAULT 0, dms_open DEFAULT 0, consented_at,
      revoked DEFAULT 0, deleted_at)
identities(id, user_id, provider CHECK IN ('google','discord'), provider_id,
      email, display_name, avatar_url, created_at, UNIQUE(provider, provider_id))
user_emails(email PRIMARY KEY (minuscule), user_id, verified_by CHECK IN
      ('oauth','admin'), added_at)
purchases(id, email, user_id NULL, product, source CHECK IN
      ('checkout','import','admin'), purchased_at, external_ref,
      UNIQUE(email, product, purchased_at))
link_requests(id, user_id, email, status CHECK IN ('pending','approved','denied'),
      token_hash, created_at, decided_at)
dms(id, from_user, to_user, text, created_at, read)          -- inchangée
blocks(user_id, blocked_id, created_at, PRIMARY KEY(user_id, blocked_id))
reports(id, reporter_id, dm_id, reason, created_at, handled_at)
rate_events(user_id, kind, at)                              -- limites de débit DM/uploads
```

Retirés par rapport à NéoVision : `tier`, `progress`, `magic_links`,
`modules.json` (le cours vit sur Podia). `formations` est remplacé par les
badges dérivés de `purchases`.

Index : `dms(from_user)`, `dms(to_user)`, `purchases(email)`,
`purchases(user_id)`, `users(visible)`.

## 6. Images (R2)

- Bucket `femzlab-espace-media`, clés `avatars/<user_id>/<sha>.webp` et
  `reels/<user_id>/<n>-<sha>.<ext>`.
- Le navigateur redimensionne l'avatar en 512×512 WebP avant envoi (canvas) ;
  le Worker vérifie taille ≤ 2 Mo, type par signature binaire (pas par
  extension), écrit dans R2, remplace l'ancienne clé (et la supprime).
- Servi par `GET /espace/media/<clé>` avec cache long (clé = empreinte du
  contenu, donc immuable). Aucune image en base.

## 7. API (Worker)

| Méthode & route | Auth | Rôle |
|---|---|---|
| `GET /espace/api/me` | session | identité courante + consentement + badges ; 401 sinon (utilisée par l'entrée nav de toutes les pages) |
| `GET /espace/api/creators` | session | points du globe : nommés si `visible`, sinon `{anon, lat, lon}` pays ; **jamais d'email** |
| `GET/PUT /espace/api/profile` | session | profil ; ville géocodée serveur (base embarquée) |
| `POST /espace/api/media/avatar`, `POST /espace/api/media/reel/:n` | session | upload R2 |
| `PUT /espace/api/consent` | session | `visible`, `dms_open` |
| `GET /espace/api/purchases` | session | mes produits (badges, liens Podia) |
| `POST /espace/api/link-requests` · `GET …` | session | demander / voir mes demandes |
| `GET /espace/api/dms`, `GET/POST /espace/api/dms/:peer`, `POST …/read` | session | messagerie (refus si bloqué ou `dms_open=0`) |
| `POST /espace/api/blocks/:peer`, `DELETE …` · `POST /espace/api/reports` | session | bloquer / signaler |
| `GET /espace/api/export` · `DELETE /espace/api/account` | session | RGPD |
| `POST /espace/hooks/checkout` | aucune (origine Podia) | achat depuis la page de remerciement |
| `GET /espace/admin/link/:token/(approve\|deny)` | jeton signé | boutons du mail |
| `GET/POST /espace/api/admin/*` | founder | demandes, import CSV, membres, signalements |
| cron `0 3 * * *` | — | copie JSON de la base → `backups/AAAA-MM-JJ.json` dans R2, rétention 90 j |

## 8. L'app `/espace` (React existante, adaptée)

- Vite `base: '/espace/'` ; assets servis par le Worker avec repli SPA.
- **Non connecté** : écran de connexion (deux boutons) + compteur « N
  créateurs dans la communauté » (agrégat, aucun nom). Rien d'autre.
- **Connecté** : CardNav (Mon espace · Messages · Confidentialité · Admin si
  fondateur), **globe** inchangé (plein écran, recherche, clusters, carte
  ancrée, chat morph), **profil** existant + carte **« Mes produits »**
  (badges, lien vers le produit sur Podia, état « en attente de liaison »
  si des achats connus n'ont pas encore de membre — jamais affiché), **DM**
  (modale génie + bloquer / signaler dans le menu de conversation),
  **Confidentialité** (toggles, connexions liées, relier une adresse, exporter,
  supprimer).
- Retirés : Hero, Modules, Packs, Upsell, TestimonialsSlider (le cours et la
  vente vivent sur Podia et femzlab.shop).
- DA : `WEBDESIGN.md` inchangé (sombre, accent bleu, Instrument Sans, zéro
  emoji, zéro mono). FR/EN : `i18n.js` existant, dictionnaire complété.
- Consentement : modale au premier login, **les deux toggles désactivés par
  défaut** ; non-consentant = point anonyme pays, non cliquable.

## 9. Entrées « partout »

- Un fragment partagé `espace-entree.html` injecté par `build.py` dans chaque
  page de femzlab.shop entre `<!-- espace:start --><!-- espace:end -->`, et
  posé dans le template de imfemz.com : un `<a href="/espace/">` dans la nav
  qui affiche « Mon espace » par défaut, puis — si `GET /espace/api/me`
  répond 200 — l'avatar rond du membre (`credentials: 'include'`). Sur
  imfemz.com le lien est absolu (`https://www.femzlab.shop/espace/`) et
  l'état connecté n'est pas affiché (autre domaine, pas de cookie) : simple
  bouton.
- DA claire du site pour ce bouton (Inter, noir/blanc), 0 dépendance.

## 10. Admin (fondateur)

Onglet « Admin » dans l'app : demandes de liaison (approuver / refuser),
import CSV Podia (glisser-déposer, rapport ligne à ligne, idempotent),
membres (recherche, profil, révoquer, retirer un achat), signalements
(contexte du DM, révoquer l'auteur ou classer). Tout passe par
`/espace/api/admin/*`, réservé à `founder=1`.

## 11. Confidentialité (RGPD)

- Base légale : consentement explicite pour la visibilité globe et les DM ;
  exécution du contrat pour le rattachement des achats.
- Localisation déclarative (ville saisie), jamais l'IP. Liste du globe sans
  email, sans identifiant de connexion.
- « Télécharger mes données » (JSON) et « Supprimer mon compte » (images
  effacées de R2, profil marqué `deleted_at` et vidé, identités supprimées,
  achats conservés **anonymisés** — email haché — pour la comptabilité).
- Mentions à ajouter à la politique de confidentialité du site : finalités,
  fournisseurs (Google, Discord, Cloudflare), durée (compte actif + 30 j),
  droits.

## 12. Sécurité et garde-fous

- OAuth : `state` + `nonce`, `redirect_uri` strict, secrets en `wrangler
  secret`. Cookie `httpOnly/Secure/SameSite=Lax`. Révocation immédiate via
  `revoked` (vérifié à chaque requête).
- Uploads : 2 Mo, type par magic bytes, 1 avatar + 3 reels, quota par membre.
- DM : 2 000 caractères, **limite en base** (`rate_events`, 30 messages / 10
  min / membre — la liaison `ratelimits` Cloudflare ne compte pas, constaté le
  2026-09-06), blocage silencieux bidirectionnel, refus si `dms_open=0`.
- Hooks checkout : origine Podia vérifiée quand présente, corps ≤ 8 Ko,
  source tracée. Boutons du mail : HMAC, usage unique, expiration.
- Admin : `founder` seulement, jamais de liste d'emails côté client hors admin.

## 13. Erreurs

- OAuth échoué / email non vérifié → retour à l'écran de connexion avec la
  raison ; jamais de compte partiel.
- Backend injoignable → état d'erreur dans l'app (plus de repli local).
- Import CSV → lignes fautives rejetées et listées, le reste appliqué.
- Upload refusé → message précis (poids, type).
- Hook checkout invalide → 400 silencieux côté Podia (le client n'en voit rien).

## 14. Tests

- **Worker (Vitest + Miniflare)** : OAuth simulé (échange, création, attache
  d'une 2ᵉ identité, email non vérifié refusé), rattachement d'achats (par
  connexion, par import, par approbation), consentement/anonymisation
  (`/creators` sans email — regex), DM (blocage, `dms_open`, débit),
  RGPD (export, suppression, anonymisation des achats), hook checkout,
  boutons signés (usage unique, expiration), cron de sauvegarde.
- **Navigateur (Playwright)** : parcours complet avec un compte Discord de
  test : connexion, modale de consentement, upload avatar, profil → point sur
  le globe, DM à Femz, blocage, export, suppression ; mobile 390 px.
- **Production** : après chaque déploiement, `curl` des routes clés et
  vérification de l'entrée nav sur l'accueil, MotionLAB, MetaVision.

## 15. Mise en route (phases)

1. **Pré-requis Femz** : identifiant OAuth Google (console Google Cloud, URI
   de redirection `https://www.femzlab.shop/espace/auth/google/callback`) ;
   identifiants OAuth de l'application Discord existante (celle du bot) avec
   la même forme d'URI. Je guide pas à pas.
2. **Socle** : Worker `femzlab-espace` + D1 + R2 + route ; OAuth ; profil ;
   consentement ; globe ; DM ; **Femz premier membre**. Validation de
   **l'écran profil** par Femz avant la suite (règle : un écran clé validé,
   puis on scale).
3. **Achats** : table, import MetaVision (48) + MotionLAB (5), badges, carte
   « Mes produits », demandes de liaison + mail Approuver/Refuser, snippet
   Podia étendu à tous les produits.
4. **Entrées partout** : fragment `build.py` sur toutes les pages + imfemz.com ;
   politique de confidentialité mise à jour.
5. **Admin & RGPD** : onglet admin, import CSV en ligne, export/suppression,
   signalements, cron de sauvegarde.
6. **Ouverture** ; phase 2 possible : rôles Discord automatiques par achat,
   rapprochement avec les licences MotionLAB, cours NéoVision hébergés.

## 16. Hors périmètre (explicite)

Création de comptes Podia depuis le site · globe public · connexion par email
ou mot de passe · hébergement des vidéos de cours · notifications push/email
aux membres · rôles Discord (phase 2).

## 17. Risques connus

- **Email Google ≠ email Podia** : rattrapage manuel par Femz (mail
  Approuver/Refuser) — volume attendu faible (~70 clients), acceptable.
- **Hook checkout falsifiable** : n'ouvre aucun contenu, seulement un badge ;
  tracé et révocable.
- **Plan gratuit** : D1 Time Travel 7 jours (30 sur Workers Paid) ; la copie
  nocturne R2 couvre au-delà. Workers Free : 100 000 requêtes/jour — large.
- **Google OAuth en « test »** : la console Google limite une app non vérifiée
  à 100 utilisateurs de test ; passer l'app en production (formulaire
  simple, pas de vérification lourde tant qu'on ne demande que email/profile).
