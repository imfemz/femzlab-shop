import { Lock } from './Icons';

/**
 * Packs — 4 cartes (contenu figé, offre du pack Créateur).
 * « Audit de tes reels » est verrouillé : cadenas SVG + bordure dashed.
 */
export default function Packs() {
  return (
    <section id="packs">
      <div className="sec-head">
        <h2>Tes packs</h2>
        <span>inclus avec le pack Créateur</span>
      </div>
      <div className="packs">
        <div className="pack glow">
          <h3>Templates de prompts</h3>
          <p>Image + vidéo, à variables, prêts à copier.</p>
          <a className="dl" href="#">
            Télécharger ↓
          </a>
        </div>
        <div className="pack glow">
          <h3>VFX Pack</h3>
          <p>Les recettes d'effets complètes, au-delà du cours.</p>
          <a className="dl" href="#">
            Télécharger ↓
          </a>
        </div>
        <div className="pack glow">
          <h3>SFX Pack</h3>
          <p>Whoosh, impacts, risers — le son qui vend l'illusion.</p>
          <a className="dl" href="#">
            Télécharger ↓
          </a>
        </div>
        <div className="pack locked glow">
          <span className="lock-tag">
            <Lock /> STUDIO
          </span>
          <h3>Audit de tes reels</h3>
          <p>Retour direct de Femz sur tes 3 reels.</p>
          <a className="dl" href="#">
            Passer à Studio →
          </a>
        </div>
      </div>
    </section>
  );
}
