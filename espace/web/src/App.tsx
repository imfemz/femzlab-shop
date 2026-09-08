import { useRef, useState } from 'react';
import Aurora from './components/Aurora';
import CardNav, { type CardNavHandle } from './components/CardNav';
import DmModal from './components/DmModal';
import ConsentModal from './components/ConsentModal';
import GlobeSection from './components/GlobeSection';
import GradualBlur from './components/GradualBlur';
import Login from './components/Login';
import ErrorScreen from './components/ErrorScreen';
import { useGlobalEffects } from './hooks/useGlobalEffects';
import { sessionState } from './lib/api';
import { erreurUrl, texteErreur } from './lib/erreurs';

/** Espace membre FemzLab : Connexion | Erreur | Espace (nav, globe, DM, consentement). */
export default function App() {
  const navRef = useRef<CardNavHandle>(null);
  const [conv, setConv] = useState<string | null>(null);
  /* ?erreur= en état connecté = échec d'attache d'un 2e fournisseur : sans ce
     bandeau, l'utilisateur revient sur son espace sans la moindre explication. */
  const [erreur, setErreur] = useState(erreurUrl);
  useGlobalEffects();
  const st = sessionState();
  return (
    <>
      <Aurora />
      {/* le même logo que femzlab.shop, fixe en haut au centre, sur tous les écrans */}
      <a className="fixed-logo" href="https://www.femzlab.shop" aria-label="FemzLab — retour sur la boutique">
        <span className="mark" aria-hidden="true" />
      </a>
      {st === 'error' && <ErrorScreen />}
      {st === 'anon' && <Login />}
      {st === 'auth' && (
        <>
          <CardNav ref={navRef} onOpenConv={setConv} />
          {erreur && (
            <div className="app-err">
              <p className="login-err" role="alert">
                <span>{texteErreur(erreur)}</span>
                <button type="button" className="app-err-x" onClick={() => setErreur(null)}>Fermer</button>
              </p>
            </div>
          )}
          <GlobeSection />
          <div className="wrap" style={{ paddingTop: 0 }}>
            <footer>
              <span>FemzLab — l’espace des créateurs</span>
              <span>
                <a href="mailto:hello@imfemz.com">Support</a> · <a href="https://discord.gg/xmwq2NMDTw" target="_blank" rel="noopener">Discord</a> · <a href="https://www.femzlab.shop">femzlab.shop</a>
              </span>
            </footer>
          </div>
          <DmModal convId={conv} onClosed={() => setConv(null)} onBackToList={() => { setConv(null); navRef.current?.openDms(); }} />
          <ConsentModal />
        </>
      )}
      <GradualBlur />
    </>
  );
}
