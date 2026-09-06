# femzlab.shop/api/avis — le formulaire d'avis arrive par email

Le formulaire `femzlab.shop/avis` poste ici. Le Worker valide, filtre les
robots, puis envoie l'avis **par email à hello@imfemz.com** avec l'entrée
`reviews.json` prête à coller. Répondre au mail répond au client (Reply-To).

Remplace la Pages Function `functions/api/avis.js` (webhook Discord jamais
configuré → le formulaire répondait 500 à chaque envoi réel).

## Pré-requis Email Service (état au 2026-09-06)

L'envoi utilise Email Service, natif Cloudflare. Vers une adresse de
destination **vérifiée** du compte, c'est gratuit sur tous les plans et hors
quota. Deux conditions :

1. **Email Routing actif sur femzlab.shop** — FAIT le 2026-09-06 par l'API
   (le jeton OAuth de wrangler porte `email_routing (write)`) : MX
   `route1-3.mx.cloudflare.net`, SPF et DKIM posés par Cloudflare. Le domaine
   n'avait aucun MX : rien de cassé, aucune boîte mail n'y existait.
2. **`hello@imfemz.com` vérifiée comme adresse de destination** — ajoutée par
   l'API, vérifiée par Femz (clic sur le mail Cloudflare) le 2026-09-06.

Chaîne vérifiée de bout en bout le 2026-09-06 : POST valide → `{"ok":true}`
→ mail reçu dans la boîte (« Avis client — MetaVision — TEST à ignorer — 5/5 »,
expéditeur avis@femzlab.shop). Si l'adresse de destination est un jour
supprimée ou changée, l'envoi échoue avec `destination address is not a
verified address` ; si Email Routing est désactivé sur femzlab.shop, avec
`could not find account config of sending domain`. Aucun redéploiement n'est
nécessaire pour corriger l'un ou l'autre côté dashboard.

## Diagnostic

    npx wrangler deploy --var DEBUG:1     # réponses enrichies d'un _debug
    …tests…
    npx wrangler deploy                   # retire le diagnostic

En mode DEBUG, chaque réponse porte le nœud Cloudflare, l'IP, le verdict du
limiteur et, sur un 502, le message d'erreur exact de l'envoi. `wrangler tail`
n'a rien remonté lors du premier diagnostic ; ce mode est plus fiable.

## Déployer

    cd femzlab-shop-front/avis-worker
    npx wrangler deploy

## Tester

    curl -s -X POST https://www.femzlab.shop/api/avis \
      -H 'content-type: application/json' \
      -d '{"produit":"MetaVision - Formation VFX","email":"test@example.com","pseudo":"Test",
           "texte":"Un avis de test assez long pour passer la validation serveur, quarante caractères.",
           "note":5,"social":"@georgesarmando","consent":true,"site":""}'

Réponse `{"ok":true}` = un mail est parti. Un champ invalide renvoie
`{"erreurs":{champ:"message"}}` (400) ; au-delà de 3 envois par minute et par
IP, 429.

## Ce que contient le mail

Produit (nom canonique + intitulé du formulaire s'il diffère), note, pseudo,
email d'achat à vérifier dans Podia, Instagram/TikTok fourni et le @pseudo
extrait, le texte public, **la partie privée** (« Un truc à améliorer ? »,
champ `prive`, 600 caractères max — encadré jaune, lue par Femz seul, jamais
publiée et absente de l'entrée JSON), la liste des étapes, et l'entrée JSON
à coller dans `src/reviews.json` (avec `instagram`/`tiktok` + `avatar`
pré-remplis quand un profil est donné — la photo se télécharge une fois dans
`src/assets/`, jamais de lien direct vers le CDN : leurs URLs expirent).

## Garde-fous

Origine limitée à femzlab.shop, champ piège invisible (`site`), corps limité à
8 Ko, validation serveur de chaque champ. La liaison `ratelimits` (3/min/IP)
est posée mais **ne compte pas dessus** : Cloudflare la décrit comme
« permissive, eventually consistent, not an accounting system », par nœud et
déconseillée sur des IP — en test, 9 envois en 4 s depuis le même nœud n'ont
jamais été refusés. Si du spam arrive dans la boîte, la vraie réponse est
Turnstile (clés à créer dans le dashboard, vérification déjà prévisible côté
Worker). Aucune donnée n'est stockée côté Cloudflare : la boîte mail est
l'archive des soumissions.
