#!/usr/bin/env node
// Usage : node scripts/import-purchases.mjs <fichier.csv> "<Nom canonique du produit>"
// Le CSV attend deux colonnes avec en-tête : email,purchased_at (AAAA-MM-JJ)
// Exporté à la main depuis le CSV de ventes Podia (colonnes Email / Purchased At).
// FZ_SESSION : valeur du cookie `__Host-fz_session` récupérée depuis les DevTools
// du navigateur (déjà connecté sur /espace), passée en variable d'environnement —
// aucun identifiant n'est jamais écrit dans un fichier.
import { readFileSync } from 'node:fs';

const [, , fichier, produit] = process.argv;
if (!fichier || !produit) { console.error('Usage: node scripts/import-purchases.mjs <fichier.csv> "<Produit canonique>"'); process.exit(1); }

const lignes = readFileSync(fichier, 'utf8').trim().split('\n').slice(1); // ignore l'en-tête
const rows = lignes.map((l) => { const [email, purchased_at] = l.split(',').map((s) => s.trim()); return { email, purchased_at }; }).filter((r) => r.email);

const res = await fetch('https://www.femzlab.shop/espace/api/admin/purchases/import', {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: `__Host-fz_session=${process.env.FZ_SESSION}` },
  body: JSON.stringify({ product: produit, rows }),
});
console.log(res.status, await res.json());
