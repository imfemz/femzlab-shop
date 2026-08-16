// Endpoint de collecte des avis clients.
// Aucune persistance : la soumission part sur un webhook Discord privé et
// Femz la recopie dans src/reviews.json après avoir vérifié l'achat dans Podia.
// Le volume attendu (~15 avis) ne justifie pas une base de données.

// Les noms historiques sont conservés : le catalogue a été renommé plusieurs
// fois et un acheteur de 2023 ne retrouverait pas son produit autrement.
const PRODUITS = new Set([
  "METAVISION - Formation VFX",
  "META VISION - Comment vivre de sa passion ?",
  "Ultimate iOS Pack",
  "Ghost FX",
  "Presets Pack",
  "VFX Presets Pack",
  "Vortex Sound Pack",
  "Whoosh Sound Pack",
  "SFX Whoosh Pack",
  "3D Text Pack",
  "3D Text Pack Pro",
  "Fade Pack",
]);

const TEXTE_MIN = 40;
const TEXTE_MAX = 400;

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function valide(c) {
  const e = {};
  const texte = (v) => (typeof v === "string" ? v.trim() : "");

  if (!PRODUITS.has(texte(c.produit))) e.produit = "Choisis le produit concerné.";

  const email = texte(c.email);
  // 254 caractères : maximum pratique d'une adresse email complète (RFC 5321).
  // Sans ce plafond, un email démesuré passerait la regex et atteindrait le
  // champ Discord correspondant, limité à 1024 caractères par embed.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254)
    e.email = "Indique l'email utilisé lors de ton achat.";

  const pseudo = texte(c.pseudo);
  if (pseudo.length < 2 || pseudo.length > 40)
    e.pseudo = "Entre 2 et 40 caractères.";

  const avis = texte(c.texte);
  if (avis.length < TEXTE_MIN)
    e.texte = `Encore un peu — ${TEXTE_MIN} caractères minimum (${avis.length} pour l'instant).`;
  else if (avis.length > TEXTE_MAX)
    e.texte = `${TEXTE_MAX} caractères maximum (${avis.length} pour l'instant).`;

  if (c.note !== null && c.note !== undefined && c.note !== "") {
    const n = Number(c.note);
    if (!Number.isInteger(n) || n < 1 || n > 5) e.note = "Une note de 1 à 5.";
  }

  if (c.consent !== true)
    e.consent = "Il faut accepter la publication pour envoyer l'avis.";

  return e;
}

function messageDiscord(c) {
  const note = c.note ? `${c.note}/5` : "non renseignée";
  return {
    embeds: [
      {
        title: "Nouvel avis client",
        color: 0x5ea2ff,
        fields: [
          { name: "Pseudo (sera publié)", value: c.pseudo.trim() },
          { name: "Produit", value: c.produit.trim() },
          { name: "Email — à vérifier dans Podia", value: c.email.trim() },
          { name: "Note", value: note, inline: true },
          { name: "Avis", value: c.texte.trim() },
        ],
        footer: { text: "Vérifie l'achat, puis ajoute-le à src/reviews.json" },
      },
    ],
  };
}

export const onRequestPost = async ({ request, env }) => {
  let corps;
  try {
    corps = await request.json();
  } catch {
    return json({ erreurs: { _: "Corps de requête illisible." } }, 400);
  }

  // Champ piège : invisible pour un humain, rempli par les robots.
  // On répond 200 pour ne pas leur apprendre qu'ils ont été repérés.
  if (typeof corps.site === "string" && corps.site.trim() !== "")
    return json({ ok: true });

  const erreurs = valide(corps);
  if (Object.keys(erreurs).length) return json({ erreurs }, 400);

  if (!env.DISCORD_WEBHOOK_AVIS)
    return json({ erreurs: { _: "Collecte indisponible pour le moment." } }, 500);

  let envoi;
  try {
    envoi = await fetch(env.DISCORD_WEBHOOK_AVIS, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(messageDiscord(corps)),
    });
  } catch {
    // Une panne Discord ou DNS fait rejeter fetch() au lieu de renvoyer une
    // réponse non-ok : sans ce filet, le client recevrait une erreur 500
    // brute de la plateforme au lieu d'un JSON exploitable.
    return json({ erreurs: { _: "Envoi impossible, réessaie dans un instant." } }, 502);
  }

  if (!envoi.ok)
    return json({ erreurs: { _: "Envoi impossible, réessaie dans un instant." } }, 502);

  return json({ ok: true });
};

export const onRequest = async ({ request }) => {
  if (request.method === "POST") return; // laisse la main à onRequestPost
  return json({ erreurs: { _: "Méthode non autorisée." } }, 405);
};
