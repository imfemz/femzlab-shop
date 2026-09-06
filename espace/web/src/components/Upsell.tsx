/**
 * Écran affiché à un membre de la communauté SANS accès NéoVision
 * (ex. client MetaVision). Il garde le globe / profil / DM, mais pas le cours —
 * à la place, une invitation à rejoindre NéoVision avec les 3 paliers.
 * Liens en dur vers la boutique femzlab.shop.
 */
const SHOP = 'https://www.femzlab.shop';

const TIERS = [
  {
    name: 'Essentiel',
    price: '150 €',
    tag: null as string | null,
    points: ['Les 9 modules + bonus After Effects', 'Templates de prompts', 'Catalogue des effets', 'Discord · accès à vie'],
  },
  {
    name: 'Créateur',
    price: '250 €',
    tag: 'Le plus choisi',
    points: ['Tout Essentiel', 'VFX Pack complet', 'SFX Pack', 'Banque de prompts étendue'],
  },
  {
    name: 'Studio',
    price: '499 €',
    tag: null,
    points: ['Tout Créateur', 'Audit de tes 3 reels par Femz', 'Groupe restreint', 'Early access'],
  },
];

export default function Upsell() {
  return (
    <section className="upsell glow">
      <span className="upsell-eyebrow">Formation VFX 100% IA</span>
      <h1 className="upsell-h">Passe au niveau supérieur avec NéoVision</h1>
      <p className="upsell-sub">
        Tu fais déjà partie de la communauté FemzLab. NéoVision t'apprend à créer des Reels VFX cinématiques
        qui stoppent le scroll — sans After Effects, uniquement avec l'IA.
      </p>

      <div className="upsell-tiers">
        {TIERS.map((t) => (
          <div className={'upsell-tier glow' + (t.tag ? ' feat' : '')} key={t.name}>
            {t.tag && <span className="upsell-tag">{t.tag}</span>}
            <h3>{t.name}</h3>
            <div className="upsell-price">{t.price}</div>
            <ul>
              {t.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <a className="btn btn-acc upsell-cta" href={SHOP} target="_blank" rel="noopener">
              Rejoindre — {t.price}
            </a>
          </div>
        ))}
      </div>
      <p className="upsell-note">Paiement en 2× possible · accès immédiat après achat sur femzlab.shop</p>
    </section>
  );
}
