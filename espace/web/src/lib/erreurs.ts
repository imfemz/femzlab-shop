/**
 * Textes des erreurs renvoyées par le Worker dans `?erreur=…` après OAuth.
 * Partagé par l'écran de connexion (état anon) et le bandeau de l'espace
 * (état auth, mode attache d'un 2e fournisseur).
 */
export const ERREURS: Record<string, string> = {
  oauth: 'La connexion a échoué chez le fournisseur. Réessaie.',
  email_non_verifie: 'Ton email n’est pas vérifié chez ce fournisseur : vérifie-le, puis reviens.',
  identite_deja_liee: 'Cette connexion est déjà rattachée à un autre compte. Connecte-toi avec elle, ou contacte Femz pour fusionner.',
  email_deja_utilise: 'Cette adresse e-mail est déjà rattachée à un autre compte. Connecte-toi avec ce compte-là, ou contacte Femz.',
};

/** Texte à afficher pour un code d'erreur (repli générique si inconnu). */
export const texteErreur = (code: string) => ERREURS[code] || 'Connexion impossible pour le moment.';

/**
 * `?erreur=` est lu **une seule fois**, au chargement du module (avant le
 * premier rendu), puis l'URL est nettoyée : l'erreur ne survit pas à un
 * rechargement, et un double rendu React (StrictMode) ne la fait pas
 * disparaître.
 */
const codeErreur: string | null = (() => {
  const code = new URLSearchParams(location.search).get('erreur');
  if (code) history.replaceState(null, '', '/espace/');
  return code;
})();

/** Le code d'erreur OAuth de ce chargement de page, ou null. */
export const erreurUrl = () => codeErreur;
