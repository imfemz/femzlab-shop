/* NéoVision i18n — runtime FR→EN translation of the rendered DOM.
   Auto-detects the viewer's language (navigator.language), stores the choice,
   re-translates on every React re-render via a MutationObserver, and exposes
   a FR/EN toggle injected top-right. FR is the source; EN comes from the dict. */
(function () {
  "use strict";

  // FR -> EN. Keys are trimmed text-node values exactly as they render.
  var DICT = {
    // Sidebar / nav
    "Mon espace": "My space",
    "Formation": "Course",
    "Les modules": "The modules",
    "Mes ressources": "My resources",
    "Communauté": "Community",
    "Le globe": "The globe",
    "Les reels des élèves": "Student reels",
    "Mon compte": "My account",
    "Ma progression": "My progress",
    "Mon pack · Créateur": "My pack · Creator",
    "Support": "Support",
    "Messages": "Messages",
    "Reprendre · 3.2": "Resume · 3.2",

    // Profile card
    "@imfemz · Pack Créateur": "@imfemz · Creator Pack",
    "15/40 épisodes vus": "15/40 episodes watched",
    "1 reel produit": "1 reel produced",
    "Ville": "City",
    "Mes 3 reels": "My 3 reels",
    "— ils s'affichent sur ta carte du globe": "— they appear on your globe map",
    "Confidentialité": "Privacy",
    "Apparaître sur le globe": "Appear on the globe",
    "Recevoir des messages": "Receive messages",
    "Enregistrer": "Save",

    // Welcome DM
    "Bienvenue dans NéoVision ! Ravi de te compter parmi nous. Si tu bloques sur un épisode ou que tu as la moindre question, réponds ici — je lis tout. Bon VFX ! — Femz":
      "Welcome to NéoVision! Glad to have you with us. If you get stuck on an episode or have any question at all, reply here — I read everything. Happy VFX! — Femz",

    // Current episode hero
    "Module 3 · En cours": "Module 3 · In progress",
    "3.2 — Contrôler le mouvement et la caméra": "3.2 — Controlling movement and the camera",
    "Push in, orbit, handheld : le vocabulaire qui transforme une animation molle en plan intentionnel.":
      "Push in, orbit, handheld: the vocabulary that turns a limp animation into an intentional shot.",
    "Reprendre l'épisode": "Resume the episode",
    "2/4 épisodes du module": "2/4 episodes in the module",
    "9 modules + bonus · 40 épisodes": "9 modules + bonus · 40 episodes",

    // Module / episode list
    "Le déclic": "The click",
    "✓ Terminé": "✓ Completed",
    "Le VFX IA en 2026": "AI VFX in 2026",
    "Anatomie d’un Reel viral": "Anatomy of a viral Reel",
    "Monte ton studio IA": "Build your AI studio",
    "Ton tout premier plan IA": "Your very first AI shot",
    "L’image qui a l’air cinéma": "The image that looks cinematic",
    "Les 4 signaux qui trahissent l’IA": "The 4 signals that give away AI",
    "Le framework de prompt image": "The image prompt framework",
    "Générer ses images dans ChatGPT": "Generating your images in ChatGPT",
    "La consistance du personnage": "Character consistency",
    "Prompt Mastery": "Prompt Mastery",
    "L’anatomie d’un prompt qui marche": "The anatomy of a prompt that works",
    "Corriger un prompt raté": "Fixing a failed prompt",
    "Le prompt pensé pour l’engagement": "The prompt built for engagement",
    "Ta bibliothèque de prompts": "Your prompt library",
    "Donner vie — image → vidéo": "Bringing it to life — image → video",
    "En cours": "In progress",
    "Le principe image-to-video": "The image-to-video principle",
    "Contrôler le mouvement et la caméra": "Controlling movement and the camera",
    "Seedance, Gemini, Kling : lequel quand": "Seedance, Gemini, Kling: which one when",
    "Gérer les échecs": "Handling failures",
    "Les effets signature": "The signature effects",
    "À venir": "Coming soon",
    "Effet : transformation / morph": "Effect: transformation / morph",
    "Effet : caméra impossible": "Effect: impossible camera",
    "Effet : apparition / duplication": "Effect: appearance / duplication",
    "Effet : changement de monde": "Effect: world change",
    "Assembler sans After Effects": "Editing without After Effects",
    "Enchaîner les plans avec du rythme": "Cutting shots together with rhythm",
    "Le sound design qui vend l’illusion": "The sound design that sells the illusion",
    "Upscale & finition": "Upscale & finishing",
    "Export 9:16 propre": "Clean 9:16 export",
    "Idées & Script": "Ideas & Script",
    "Trouver des idées qui ne sèchent jamais": "Finding ideas that never run dry",
    "Valider une idée avant de produire": "Validating an idea before producing",
    "Écrire le script d’un Reel VFX": "Writing the script of a VFX Reel",
    "Du script au plan de production": "From script to production plan",
    "Rendre viral": "Going viral",
    "Le hook en 2 secondes": "The hook in 2 seconds",
    "Structure de rétention": "Retention structure",
    "Les leviers d’engagement": "The engagement levers",
    "Emballage : titre, caption, CTA": "Packaging: title, caption, CTA",
    "Ton système de production": "Your production system",
    "Le workflow répétable": "The repeatable workflow",
    "Batcher sa production": "Batching your production",
    "Ta bibliothèque perso": "Your personal library",
    "Éthique & limites": "Ethics & limits",
    "Bonus — After Effects": "Bonus — After Effects",
    "AE en 20 min + casser le « AI look »": "AE in 20 min + breaking the “AI look”",
    "Intégrer un plan IA dans une vraie vidéo": "Integrating an AI shot into a real video",
    "Le motion tracking": "Motion tracking",
    "Le match final (grade, grain)": "The final match (grade, grain)",

    // Packs
    "Tes packs": "Your packs",
    "inclus avec le pack Créateur": "included with the Creator pack",
    "Templates de prompts": "Prompt templates",
    "Image + vidéo, à variables, prêts à copier.": "Image + video, with variables, ready to copy.",
    "Télécharger ↓": "Download ↓",
    "VFX Pack": "VFX Pack",
    "Les recettes d'effets complètes, au-delà du cours.": "The complete effect recipes, beyond the course.",
    "SFX Pack": "SFX Pack",
    "Whoosh, impacts, risers — le son qui vend l'illusion.": "Whoosh, impacts, risers — the sound that sells the illusion.",
    "Audit de tes reels": "Audit of your reels",
    "Retour direct de Femz sur tes 3 reels.": "Direct feedback from Femz on your 3 reels.",
    "Passer à Studio →": "Upgrade to Studio →",

    // Globe / community
    "La communauté, en direct": "The community, live",
    "créateurs · MetaVision & NéoVision": "creators · MetaVision & NéoVision",
    "Chaque point est un vrai client FemzLab. Attrape le globe, zoome, clique.":
      "Each dot is a real FemzLab client. Grab the globe, zoom, click.",
    "Glisse pour tourner · molette pour zoomer · clique un point":
      "Drag to rotate · scroll to zoom · click a dot",
    "Explorer le globe": "Explore the globe",
    "Dézoomer": "Zoom out",

    // Testimonials
    "Ils créent avec NéoVision": "They create with NéoVision",
    "Reel de Léa · 48K vues": "Léa's reel · 48K views",
    "Léa raconte…": "Léa's story…",
    "« J'ai publié mon premier reel VFX trois jours après avoir commencé. 48 000 vues. »":
      "“I published my first VFX reel three days after starting. 48,000 views.”",
    "Reel de Maxime · 112K vues": "Maxime's reel · 112K views",
    "Maxime raconte…": "Maxime's story…",
    "« Prompt Mastery a changé ma façon de bosser. Deux essais au lieu de vingt. »":
      "“Prompt Mastery changed the way I work. Two tries instead of twenty.”",
    "Reel de Sarah · 27K vues": "Sarah's reel · 27K views",
    "Sarah raconte…": "Sarah's story…",
    "« Le Discord et le globe, c'est ce qui me fait rester. On se pousse vers le haut. »":
      "“The Discord and the globe are what make me stay. We push each other up.”",

    // Footer
    "NéoVision — une formation FemzLab": "NéoVision — a FemzLab course",
    "Support · Discord · femzlab.shop": "Support · Discord · femzlab.shop",

    // Placeholders
    "@pseudo": "@handle",
    "Lien du reel 1 (Instagram / TikTok)": "Reel 1 link (Instagram / TikTok)",
    "Lien du reel 2": "Reel 2 link",
    "Lien du reel 3": "Reel 3 link",
    "Rechercher un créateur… (@pseudo)": "Search a creator… (@handle)"
  };

  // Kept identical in both languages (skip untranslated warnings / avoid touching):
  // "NÉO","VISION","FZ","Femz","Instagram","TikTok","YouTube","Discord","STUDIO",
  // "Le globe" module tags M0..M8/BONUS/B.x, @handles, names.

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

  function injectToggle() {
    if (document.getElementById("nv-langsw")) return;
    var box = document.createElement("div");
    box.id = "nv-langsw";
    box.style.cssText =
      "position:fixed;top:14px;right:16px;z-index:99999;display:flex;gap:2px;" +
      "padding:3px;border-radius:999px;background:rgba(15,17,22,.72);" +
      "backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);" +
      "border:1px solid rgba(255,255,255,.12);font:600 12px/1 system-ui,-apple-system,sans-serif;" +
      "box-shadow:0 4px 20px rgba(0,0,0,.35)";
    box.innerHTML =
      '<button id="nv-lang-fr" style="all:unset;cursor:pointer;padding:5px 11px;border-radius:999px;color:#cfd3da">FR</button>' +
      '<button id="nv-lang-en" style="all:unset;cursor:pointer;padding:5px 11px;border-radius:999px;color:#cfd3da">EN</button>';
    document.body.appendChild(box);
    var fr = box.querySelector("#nv-lang-fr");
    var en = box.querySelector("#nv-lang-en");
    function paint() {
      var active = "background:#5EA2FF;color:#0B0C0F";
      fr.style.cssText = fr.style.cssText.replace(/;background:#5EA2FF;color:#0B0C0F/, "");
      en.style.cssText = en.style.cssText.replace(/;background:#5EA2FF;color:#0B0C0F/, "");
      if (lang === "fr") fr.style.cssText += ";" + active;
      else en.style.cssText += ";" + active;
    }
    fr.addEventListener("click", function () { setLang("fr"); paint(); });
    en.addEventListener("click", function () { setLang("en"); paint(); });
    paint();
  }

  function boot() {
    injectToggle();
    applyLang();
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
