/* FemzLab espace i18n — runtime FR→EN translation of the rendered DOM.
   Auto-detects the viewer's language (navigator.language), stores the choice,
   re-translates on every React re-render via a MutationObserver, and exposes
   a FR/EN toggle injected top-right. FR is the source; EN comes from the dict.
   Covers the socle's own static copy (login, error, consent, profile, nav).
   Server error messages from the Worker are concatenated with dynamic text
   before render and are not covered by this exact-text-node match. */
(function () {
  "use strict";

  // FR -> EN. Keys are trimmed text-node values exactly as they render.
  var DICT = {
    // Login (anonymous)
    "Ton espace FemzLab": "Your FemzLab space",
    "Ton profil, la carte des créateurs, tes messages — et tes produits, réunis au même endroit.":
      "Your profile, the creator map, your messages — and your products, all in one place.",
    "Continuer avec Google": "Continue with Google",
    "Continuer avec Discord": "Continue with Discord",
    "créateurs": "creators",
    "créateur": "creator",
    "dans la communauté": "in the community",
    "Aucune adresse e-mail n’est jamais affichée. Tu choisis toi-même si tu apparais sur la carte.":
      "Your email address is never shown. You choose whether you appear on the map.",

    // Error screen (backend unreachable)
    "L’espace est momentanément indisponible": "The space is temporarily unavailable",
    "Le serveur ne répond pas. Rien n’est perdu : ton profil vit sur nos serveurs, pas dans ce navigateur. Réessaie dans un instant.":
      "The server isn't responding. Nothing is lost: your profile lives on our servers, not in this browser. Try again in a moment.",
    "Réessayer": "Retry",

    // OAuth errors (?erreur=…)
    "La connexion a échoué chez le fournisseur. Réessaie.": "The connection failed with the provider. Try again.",
    "Ton email n’est pas vérifié chez ce fournisseur : vérifie-le, puis reviens.":
      "Your email isn't verified with this provider: verify it, then come back.",
    "Cette connexion est déjà rattachée à un autre compte. Connecte-toi avec elle, ou contacte Femz pour fusionner.":
      "This login is already linked to another account. Sign in with it, or contact Femz to merge them.",
    "Cette adresse e-mail est déjà rattachée à un autre compte. Connecte-toi avec ce compte-là, ou contacte Femz.":
      "This email address is already linked to another account. Sign in with that account, or contact Femz.",
    "Connexion impossible pour le moment.": "Can't connect right now.",

    // Consent modal (first login)
    "Rejoins le globe FemzLab": "Join the FemzLab globe",
    "La communauté des créateurs FemzLab vit sur un globe interactif. Choisis comment tu y apparais — tu pourras changer d'avis à tout moment dans ton profil.":
      "The FemzLab creator community lives on an interactive globe. Choose how you show up there — you can change your mind anytime in your profile.",
    "Ta ville et ton profil visibles par les autres créateurs": "Your city and profile visible to other creators",
    "Les créateurs peuvent t'envoyer un DM": "Creators can send you a DM",
    "Continuer": "Continue",
    "Réglage non enregistré — réessaie.": "Setting not saved — try again.",
    "Aucune adresse e-mail n'est jamais affichée.": "Your email address is never shown.",

    // Profile panel
    "Ton profil": "Your profile",
    "Fondateur · FemzLab": "Founder · FemzLab",
    "Membre FemzLab": "FemzLab member",
    "Nom affiché": "Display name",
    "Ville": "City",
    "Mes 3 reels": "My 3 reels",
    "— ils s'affichent sur ta carte du globe": "— they appear on your globe map",
    "Confidentialité": "Privacy",
    "Apparaître sur le globe": "Appear on the globe",
    "Recevoir des messages": "Receive messages",
    "Enregistrer": "Save",
    "Enregistré": "Saved",
    "Réglage de confidentialité non enregistré — réessaie.": "Privacy setting not saved — try again.",
    "Connexions :": "Connections:",
    "ajouter Google": "add Google",
    "ajouter Discord": "add Discord",
    "Se déconnecter": "Log out",
    "Mes produits": "My products",
    "Accéder": "Open",
    "Connecte-toi avec l'email de ton achat.": "Sign in with the email you purchased with.",
    "Mot de passe oublié ?": "Forgot your password?",
    "Aucun produit rattaché pour l'instant.": "No product linked yet.",
    "Email utilisé pour l'achat": "Email used for the purchase",
    "Relier une autre adresse": "Link another address",
    "Demande de liaison envoyée — en attente de validation par Femz.": "Link request sent — waiting for Femz to review it.",
    "Ta dernière demande de liaison a été refusée. Tu peux en soumettre une nouvelle.": "Your last link request was declined. You can submit a new one.",

    // Nav / messages
    "Mon espace": "My space",
    "Mon compte": "My account",
    "Mon profil": "My profile",
    "Communauté": "Community",
    "Le globe": "The globe",
    "La boutique": "The shop",
    "Aucune conversation — clique un créateur sur le globe.": "No conversation yet — click a creator on the globe.",
    "Message non envoyé": "Message not sent",

    // Globe section
    "La communauté, en direct": "The community, live",
    "Chaque point est un vrai client FemzLab. Attrape le globe, zoome, clique.":
      "Every dot is a real FemzLab customer. Grab the globe, zoom in, click.",
    "Glisse pour tourner · molette pour zoomer · clique un point": "Drag to rotate · scroll to zoom · click a dot",
    "Explorer le globe": "Explore the globe",
    "Dézoomer": "Zoom out",
    "Réduire le globe": "Shrink the globe",
    "Envoyer un DM": "Send a DM",
    "créateurs ici": "creators here",
    "Fermer": "Close",

    // Footer
    "FemzLab — l’espace des créateurs": "FemzLab — the creators’ space",

    // Placeholders
    "@pseudo": "@handle",
    "@chaîne": "@handle",
    "Lien du reel 1 (Instagram / TikTok)": "Reel 1 link (Instagram / TikTok)",
    "Lien du reel 2": "Reel 2 link",
    "Lien du reel 3": "Reel 3 link",
    "Rechercher un créateur… (@pseudo)": "Search a creator… (@handle)"
  };

  // Kept identical in both languages on purpose (no dict entry needed):
  // "FemzLab", "Femz", "Instagram", "TikTok", "YouTube", "Discord",
  // "Messages", "Support", @handles, city/display names, dynamic server text.

  var LS_KEY = "nv_lang";
  var lang = localStorage.getItem(LS_KEY);
  if (!lang) {
    lang = (navigator.language || "fr").toLowerCase().indexOf("fr") === 0 ? "fr" : "en";
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };

  function translateTextNode(node) {
    var raw = node.nodeValue;
    if (!raw) return;
    var key = raw.trim();
    if (!key) return;
    var en = DICT[key];
    if (en !== undefined && en !== key) {
      // preserve surrounding whitespace of the original node value
      node.nodeValue = raw.replace(key, en);
    }
  }

  function translatePlaceholders(root) {
    var els = (root.querySelectorAll ? root : document).querySelectorAll("[placeholder]");
    for (var i = 0; i < els.length; i++) {
      var ph = els[i].getAttribute("placeholder");
      if (ph && DICT[ph.trim()] !== undefined) els[i].setAttribute("placeholder", DICT[ph.trim()]);
    }
  }

  function walk(root) {
    if (lang !== "en") return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        return p && !SKIP_TAGS[p.nodeName] ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var n;
    while ((n = w.nextNode())) translateTextNode(n);
    translatePlaceholders(document);
  }

  var observer = null;
  function startObserver() {
    if (observer || lang !== "en") return;
    observer = new MutationObserver(function (muts) {
      // Debounce-free but guarded: translate only added/changed nodes.
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "characterData") {
          translateTextNode(m.target);
        } else {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var an = m.addedNodes[j];
            if (an.nodeType === 3) translateTextNode(an);
            else if (an.nodeType === 1 && !SKIP_TAGS[an.nodeName]) walk(an);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function applyLang() {
    document.documentElement.lang = lang;
    if (lang === "en") {
      walk(document.body);
      startObserver();
    }
    var btnFr = document.getElementById("nv-lang-fr");
    var btnEn = document.getElementById("nv-lang-en");
    if (btnFr && btnEn) {
      btnFr.setAttribute("aria-pressed", String(lang === "fr"));
      btnEn.setAttribute("aria-pressed", String(lang === "en"));
    }
  }

  function setLang(l) {
    if (l === lang) return;
    localStorage.setItem(LS_KEY, l);
    // Simplest reliable path for EN->FR (undo): full reload restores source text.
    if (l === "fr") {
      location.reload();
      return;
    }
    lang = l;
    applyLang();
  }

  /* Toggle FR/EN : stylé par index.css (#nv-langsw). Docké dans la card nav
     (#langslot, posé par React après le boot) quand elle existe, sinon
     flottant en haut à droite (page de connexion). */
  function injectToggle() {
    if (document.getElementById("nv-langsw")) return;
    var box = document.createElement("div");
    box.id = "nv-langsw";
    box.setAttribute("aria-label", "Langue / Language");
    box.innerHTML =
      '<button type="button" id="nv-lang-fr" aria-pressed="false">FR</button>' +
      '<button type="button" id="nv-lang-en" aria-pressed="false">EN</button>';
    document.body.appendChild(box);
    box.querySelector("#nv-lang-fr").addEventListener("click", function () { setLang("fr"); applyLang(); });
    box.querySelector("#nv-lang-en").addEventListener("click", function () { setLang("en"); applyLang(); });
  }
  function dockToggle() {
    var box = document.getElementById("nv-langsw");
    var slot = document.getElementById("langslot");
    if (!box) return;
    if (slot && box.parentNode !== slot) slot.appendChild(box);
    else if (!slot && box.parentNode !== document.body) document.body.appendChild(box);
  }
  function watchSlot() {
    dockToggle();
    if (typeof MutationObserver === "undefined") return;
    new MutationObserver(dockToggle).observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    injectToggle();
    applyLang();
    watchSlot();
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
