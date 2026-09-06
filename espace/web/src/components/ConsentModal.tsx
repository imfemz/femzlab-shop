import { useEffect, useState } from 'react';
import { needsConsent, saveConsent } from '../lib/api';

/**
 * Modale de consentement au premier login (RGPD, opt-in).
 * « Rejoins le globe FemzLab » : l'élève choisit d'apparaître sur le globe
 * (avec sa ville) et/ou de recevoir des DM. Le choix pose `consented_at`
 * côté serveur → la modale ne réapparaît plus. Modifiable ensuite dans le profil.
 * Style DA : glass + bounce iOS. En mode démo (pas de session) : jamais affichée.
 */
export default function ConsentModal() {
  const [show, setShow] = useState(false);
  const [on, setOn] = useState(false); // pilote l'animation d'entrée
  const [visible, setVisible] = useState(true);
  const [dms, setDms] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!needsConsent()) return;
    setShow(true);
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, []);

  if (!show) return null;

  async function confirm() {
    setBusy(true);
    try {
      await saveConsent(visible, dms);
    } catch {
      /* offline : le choix est appliqué localement quand même */
    }
    setOn(false);
    setTimeout(() => setShow(false), 320);
  }

  return (
    <>
      <div className={'dmov' + (on ? ' on' : '')} aria-hidden="true" />
      <div className={'consent' + (on ? ' on' : '')} role="dialog" aria-label="Rejoindre le globe">
        <h2 className="consent-h">Rejoins le globe FemzLab</h2>
        <p className="consent-p">
          La communauté des créateurs FemzLab vit sur un globe interactif. Choisis comment tu y apparais —
          tu pourras changer d'avis à tout moment dans ton profil.
        </p>

        <button className="consent-row" onClick={() => setVisible((v) => !v)} type="button">
          <span className="consent-txt">
            <b>Apparaître sur le globe</b>
            <span>Ta ville et ton profil visibles par les autres créateurs</span>
          </span>
          <span className={'tg' + (visible ? ' on' : '')} aria-hidden="true">
            <i />
          </span>
        </button>

        <button className="consent-row" onClick={() => setDms((v) => !v)} type="button">
          <span className="consent-txt">
            <b>Recevoir des messages</b>
            <span>Les créateurs peuvent t'envoyer un DM</span>
          </span>
          <span className={'tg' + (dms ? ' on' : '')} aria-hidden="true">
            <i />
          </span>
        </button>

        <button className="btn btn-acc consent-cta" onClick={confirm} disabled={busy}>
          {busy ? '…' : 'Continuer'}
        </button>
        <p className="consent-note">Aucune adresse e-mail n'est jamais affichée.</p>
      </div>
    </>
  );
}
