# /api/avis

Reçoit les soumissions du formulaire `femzlab.shop/avis` et les poste sur un
webhook Discord privé. Aucune persistance.

## Secret requis

`DISCORD_WEBHOOK_AVIS` — l'URL du webhook Discord.

Le dépôt est **public** : cette URL ne doit jamais y figurer. Quiconque la
possède peut poster dans le salon.

Création du webhook : Discord → salon privé → Modifier le salon →
Intégrations → Webhooks → Nouveau webhook → Copier l'URL.

Enregistrement du secret :

    npx wrangler pages secret put DISCORD_WEBHOOK_AVIS --project-name femzlab-shop

En local, `wrangler pages dev` lit un fichier `.dev.vars` à la racine —
déjà couvert par `.gitignore`.

## Test local

    npx wrangler pages dev dist

Puis dans un autre terminal :

    curl -s -X POST http://localhost:8788/api/avis \
      -H 'content-type: application/json' \
      -d '{"produit":"Ghost FX","email":"test@example.com","pseudo":"Test",
           "texte":"Un avis de test assez long pour passer la validation serveur.",
           "note":5,"consent":true,"site":""}'
