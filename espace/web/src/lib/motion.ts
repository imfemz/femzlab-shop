/** Helpers mouvement partagés. */

/** true si l'utilisateur préfère un mouvement réduit — tout doit se figer proprement. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** true si l'appareil a un vrai pointeur (souris/trackpad) — sinon pas de glow/tilt. */
export function hasFinePointer(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(hover:hover) and (pointer:fine)').matches;
}
