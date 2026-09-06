// DM de bienvenue multilingue — la langue suit le pays du compte.
// (aussi utilisé par gen-import.mjs pour l'import initial ; ici pour le webhook Podia)
const WELCOME: Record<string, string> = {
  fr: "Bienvenue dans NéoVision ! Ravi de te compter parmi nous. Si tu bloques sur un épisode ou que tu as la moindre question, réponds ici — je lis tout. Bon VFX ! — Femz",
  en: "Welcome to NéoVision! Glad to have you on board. If you get stuck on an episode or have any question, just reply here — I read everything. Happy VFX! — Femz",
  es: "¡Bienvenido a NéoVision! Encantado de tenerte con nosotros. Si te atascas en un episodio o tienes cualquier duda, responde aquí — lo leo todo. ¡Buen VFX! — Femz",
  pt: "Bem-vindo ao NéoVision! Feliz por ter você conosco. Se travar em algum episódio ou tiver dúvidas, responda aqui — eu leio tudo. Bom VFX! — Femz",
  de: "Willkommen bei NéoVision! Schön, dass du dabei bist. Wenn du bei einer Episode feststeckst oder Fragen hast, antworte einfach hier — ich lese alles. Viel Spaß! — Femz",
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
