// DM de bienvenue multilingue — la langue suit le pays du compte.
// (aussi utilisé par gen-import.mjs pour l'import initial ; ici pour le webhook Podia)
const WELCOME: Record<string, string> = {
  fr: "Bienvenue dans l'espace FemzLab ! Ravi de te compter parmi nous. Une question, un blocage, une idée : réponds ici — je lis tout. — Femz",
  en: "Welcome to the FemzLab space! Glad to have you on board. A question, a blocker, an idea: just reply here — I read everything. — Femz",
  es: "¡Bienvenido al espacio FemzLab! Encantado de tenerte con nosotros. Una duda, un bloqueo, una idea: responde aquí — lo leo todo. — Femz",
  pt: "Bem-vindo ao espaço FemzLab! Feliz por ter você conosco. Uma dúvida, um bloqueio, uma ideia: responda aqui — eu leio tudo. — Femz",
  de: "Willkommen im FemzLab-Space! Schön, dass du dabei bist. Eine Frage, ein Hindernis, eine Idee: antworte einfach hier — ich lese alles. — Femz",
};
const LANG: Record<string, string> = {
  FR: 'fr', BE: 'fr', CH: 'fr', LU: 'fr', MC: 'fr', SN: 'fr', CM: 'fr', CI: 'fr', ML: 'fr',
  BF: 'fr', BJ: 'fr', TG: 'fr', GA: 'fr', CD: 'fr', CG: 'fr', MG: 'fr', KM: 'fr', HT: 'fr',
  RE: 'fr', GP: 'fr', MQ: 'fr', YT: 'fr', MA: 'fr', DZ: 'fr', TN: 'fr',
  ES: 'es', MX: 'es', AR: 'es', PE: 'es', CO: 'es', VE: 'es', BR: 'pt', PT: 'pt', DE: 'de', AT: 'de',
};

export function welcomeFor(cc: string | null | undefined): string {
  return WELCOME[LANG[String(cc || '').toUpperCase()] || 'en'] || WELCOME.en;
}

/** Texte de bienvenue pour un code langue ISO 2 lettres ; français par défaut (l'app est en français). */
export function welcomeForLang(lang: string): string {
  return WELCOME[String(lang || '').toLowerCase()] || WELCOME.fr;
}

/**
 * Langue tirée de l'en-tête Accept-Language du navigateur ; `fr` si absent,
 * mal formé, ou si le code (même bien formé, ex. `zz`) n'est pas une langue
 * gérée par WELCOME — `users.lang` ne doit jamais contenir autre chose que
 * l'une de ces 5 valeurs.
 */
export const langFrom = (h: string | null | undefined): string => {
  const code = (h || '').split(',')[0].trim().slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(code) && code in WELCOME ? code : 'fr';
};
