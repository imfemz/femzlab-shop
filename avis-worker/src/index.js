/**
 * femzlab.shop/api/avis — collecte des avis clients.
 *
 * Aucune persistance : la soumission part par email à Femz (hello@imfemz.com),
 * qui vérifie l'achat dans Podia puis colle l'entrée prête à l'emploi dans
 * src/reviews.json. Le volume attendu (quelques dizaines d'avis) ne justifie
 * pas une base de données ; la boîte mail est l'archive de ce qui a été
 * soumis, en face de ce qui a été publié.
 *
 * Remplace la Pages Function qui postait sur un webhook Discord jamais
 * configuré (le formulaire répondait 500 à chaque envoi réel).
 */

// Valeurs du <select> du formulaire → nom canonique attendu par le marqueur
// `produit="…"` des pages produit (build.py). Les intitulés historiques du
// catalogue Podia sont conservés côté formulaire (un acheteur de 2023 ne
// retrouverait pas son produit autrement) et rabattus ici sur le nom actuel.
const PRODUITS = {
  "MotionLAB": "MotionLAB",
  "METAVISION - Formation VFX": "MetaVision",
  "META VISION - Comment vivre de sa passion ?": "MetaVision",
  "Ultimate iOS Pack": "Ultimate iOS Pack",
  "Ghost FX": "Ghost FX",
  "Presets Pack": "Presets Pack",
  "VFX Presets Pack": "Presets Pack",
  "Vortex Sound Pack": "Vortex Sound Pack",
  "Whoosh Sound Pack": "Whoosh Sound Pack",
  "SFX Whoosh Pack": "Whoosh Sound Pack",
  "3D Text Pack": "3D Text Pack",
  "3D Text Pack Pro": "3D Text Pack Pro",
  "Fade Pack": "Fade Pack",
};

const TEXTE_MIN = 40;
const TEXTE_MAX = 400;
const CORPS_MAX = 8 * 1024; // octets — le formulaire complet fait < 2 Ko

// Un POST en text/plain est une requête CORS « simple » sans préflight : sans
// ce contrôle, un site tiers pourrait faire soumettre le formulaire par ses
// propres visiteurs, depuis leurs IP, et contourner la limite par IP.
const ORIGINES = new Set(["https://femzlab.shop", "https://www.femzlab.shop"]);

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const texte = (v) => (typeof v === "string" ? v.trim() : "");

const html = (v) => String(v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Lien ou pseudo Instagram / TikTok, facultatif. Sert à Femz pour récupérer
 * la photo de profil à afficher sur la carte. Formes acceptées :
 *   @pseudo · pseudo · instagram.com/pseudo · tiktok.com/@pseudo
 *   (avec ou sans https:// et www.) · un lien court vm.tiktok.com/… tel quel.
 * Retourne { reseau, pseudo, brut } ou null si vide ; lève une chaîne
 * d'erreur si la valeur ne ressemble à rien de connu.
 */
function social(v) {
  const brut = texte(v);
  if (!brut) return null;
  if (brut.length > 120) throw "Un @pseudo ou un lien de profil (120 caractères max).";
  let m;
  if ((m = brut.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i)))
    return { reseau: "instagram", pseudo: m[1].replace(/\.+$/, ""), brut };
  if ((m = brut.match(/^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{1,24})\/?(?:[?#].*)?$/i)))
    return { reseau: "tiktok", pseudo: m[1].replace(/\.+$/, ""), brut };
  if (/^(?:https?:\/\/)?(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+\/?$/i.test(brut))
    return { reseau: "tiktok", pseudo: null, brut };
  if ((m = brut.match(/^@?([A-Za-z0-9._]{1,30})$/)))
    return { reseau: null, pseudo: m[1].replace(/\.+$/, ""), brut };
  throw "Un @pseudo, ou un lien instagram.com / tiktok.com.";
}

function valide(c) {
  const e = {};

  if (!(texte(c.produit) in PRODUITS)) e.produit = "Choisis le produit concerné.";

  const email = texte(c.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254)
    e.email = "Indique l'email utilisé lors de ton achat.";

  const pseudo = texte(c.pseudo);
  if (pseudo.length < 2 || pseudo.length > 40) e.pseudo = "Entre 2 et 40 caractères.";

  const avis = texte(c.texte);
  if (avis.length < TEXTE_MIN)
    e.texte = `Encore un peu — ${TEXTE_MIN} caractères minimum (${avis.length} pour l'instant).`;
  else if (avis.length > TEXTE_MAX)
    e.texte = `${TEXTE_MAX} caractères maximum (${avis.length} pour l'instant).`;

  if (c.note !== null && c.note !== undefined && c.note !== "") {
    const n = Number(c.note);
    if (!Number.isInteger(n) || n < 1 || n > 5) e.note = "Une note de 1 à 5.";
  }

  try { social(c.social); } catch (msg) { e.social = msg; }

  if (c.consent !== true) e.consent = "Il faut accepter la publication pour envoyer l'avis.";

  return e;
}

/** L'entrée reviews.json prête à coller — le travail de Femz se résume à vérifier l'achat. */
function entreeJson(c, res, date) {
  const produit = PRODUITS[texte(c.produit)];
  const slug = (res && res.pseudo) || texte(c.pseudo).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const entree = {
    id: `${date}-${slug}`,
    pseudo: texte(c.pseudo),
    produit,
    texte: texte(c.texte),
    note: c.note ? Number(c.note) : null,
    date,
  };
  if (res && res.pseudo) {
    // Réseau non précisé (pseudo nu) : on suppose Instagram, Femz corrige si besoin.
    entree[res.reseau || "instagram"] = res.pseudo;
    entree.avatar = `avatar-${res.pseudo}.jpg`;
  }
  return JSON.stringify(entree, null, 2);
}

function courriel(c, res, date) {
  const produit = PRODUITS[texte(c.produit)];
  const note = c.note ? `${c.note}/5` : "sans note";
  const pseudo = texte(c.pseudo);
  const lignes = [
    ["Produit", `${produit}${texte(c.produit) !== produit ? ` (formulaire : ${texte(c.produit)})` : ""}`],
    ["Note", note],
    ["Pseudo (sera publié)", pseudo],
    ["Email — à vérifier dans Podia", texte(c.email)],
    ["Instagram / TikTok", res ? `${res.brut}${res.pseudo ? ` → @${res.pseudo}` : ""}${res.reseau ? ` (${res.reseau})` : " (réseau à confirmer)"}` : "non renseigné"],
    ["Reçu le", date],
  ];
  const avis = texte(c.texte);
  const snippet = entreeJson(c, res, date);
  const aFaire = [
    "1. Vérifier l'email dans Podia (liste des factures).",
    res && res.pseudo
      ? `2. Récupérer la photo de profil → src/assets/avatar-${res.pseudo}.jpg (jamais de lien direct vers le CDN, les URLs expirent).`
      : "2. Pas d'Instagram/TikTok fourni : la carte affichera l'initiale.",
    "3. Coller l'entrée ci-dessous dans src/reviews.json, puis python3 build.py et déployer.",
  ];

  const text =
    `Nouvel avis client\n\n` +
    lignes.map(([k, v]) => `${k} : ${v}`).join("\n") +
    `\n\nAvis :\n${avis}\n\nÀ faire :\n${aFaire.join("\n")}\n\nEntrée reviews.json :\n${snippet}\n`;

  const htmlCorps =
    `<div style="font:15px/1.5 -apple-system,Segoe UI,Inter,sans-serif;color:#111;max-width:640px">` +
    `<h2 style="margin:0 0 14px;font-size:18px">Nouvel avis client</h2>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    lignes.map(([k, v]) =>
      `<tr><td style="padding:4px 14px 4px 0;color:#666;white-space:nowrap;vertical-align:top">${html(k)}</td><td style="padding:4px 0">${html(v)}</td></tr>`).join("") +
    `</table>` +
    `<blockquote style="margin:18px 0;padding:14px 18px;background:#f3f3f1;border-radius:12px;font-size:16px;white-space:pre-wrap">${html(avis)}</blockquote>` +
    `<p style="margin:0 0 6px;color:#666;font-size:13px">À faire</p><ol style="margin:0 0 18px;padding-left:20px;font-size:14px">` +
    aFaire.map((l) => `<li>${html(l.replace(/^\d\.\s/, ""))}</li>`).join("") + `</ol>` +
    `<p style="margin:0 0 6px;color:#666;font-size:13px">Entrée reviews.json</p>` +
    `<pre style="margin:0;padding:14px;background:#161616;color:#eee;border-radius:12px;font-size:12.5px;overflow:auto">${html(snippet)}</pre>` +
    `</div>`;

  return {
    subject: `Avis client — ${produit} — ${pseudo}${c.note ? ` — ${c.note}/5` : ""}`,
    text,
    html: htmlCorps,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method !== "POST") return json({ erreurs: { _: "Méthode non autorisée." } }, 405);

    // Une requête sans Origin (curl, tests) reste acceptée ; seule une Origin
    // explicitement étrangère au site est rejetée.
    const origine = request.headers.get("Origin");
    if (origine && !ORIGINES.has(origine)) return json({ erreurs: { _: "Origine non autorisée." } }, 403);

    const ip = request.headers.get("CF-Connecting-IP") || "inconnue";
    // Diagnostic (déploiement avec `--var DEBUG:1` uniquement) : nœud Cloudflare,
    // verdict du limiteur et message d'erreur d'envoi remontés dans la réponse.
    const debug = env.DEBUG === "1";
    const info = debug ? { colo: request.cf && request.cf.colo, ip } : undefined;
    if (env.AVIS_LIMIT) {
      const { success } = await env.AVIS_LIMIT.limit({ key: ip });
      if (info) info.rl = success;
      if (!success) return json({ erreurs: { _: "Trop d'envois d'affilée — réessaie dans une minute." }, _debug: info }, 429);
    }

    const brut = await request.text();
    if (brut.length > CORPS_MAX) return json({ erreurs: { _: "Corps de requête trop long." } }, 413);
    let corps;
    try { corps = JSON.parse(brut); } catch { return json({ erreurs: { _: "Corps de requête illisible." } }, 400); }
    if (!corps || typeof corps !== "object") return json({ erreurs: { _: "Corps de requête illisible." } }, 400);

    // Champ piège : invisible pour un humain, rempli par les robots. On répond
    // 200 pour ne pas leur apprendre qu'ils ont été repérés.
    if (texte(corps.site) !== "") return json({ ok: true });

    const erreurs = valide(corps);
    if (Object.keys(erreurs).length) return json({ erreurs, _debug: info }, 400);

    const res = social(corps.social);
    const date = new Date().toISOString().slice(0, 10);
    const message = courriel(corps, res, date);

    try {
      await env.EMAIL.send({
        from: { email: env.EXPEDITEUR, name: "FemzLab — Avis" },
        to: env.DESTINATION,
        // Répondre au mail répond directement au client.
        replyTo: { email: texte(corps.email), name: texte(corps.pseudo) },
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (e) {
      const detail = e && e.message ? e.message : String(e);
      console.error("envoi email impossible :", detail);
      return json({ erreurs: { _: "Envoi impossible, réessaie dans un instant." }, _debug: info && { ...info, detail } }, 502);
    }

    return json({ ok: true });
  },
};
