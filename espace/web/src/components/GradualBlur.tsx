/**
 * GradualBlur — 5 couches backdrop-filter masquées par bandes de 20 %
 * (0.19/0.35/0.53/0.69/0.75rem, hauteur 7rem, z-50).
 * Le footer et les boutons du bas du globe (z-60) passent AU-DESSUS.
 */
export default function GradualBlur() {
  return (
    <div className="gblur" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
