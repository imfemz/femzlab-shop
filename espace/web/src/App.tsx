import { useRef, useState } from 'react';
import Aurora from './components/Aurora';
import DotField from './components/DotField';
import CardNav, { type CardNavHandle } from './components/CardNav';
import DmModal from './components/DmModal';
import ConsentModal from './components/ConsentModal';
import GlobeSection from './components/GlobeSection';
import GradualBlur from './components/GradualBlur';
import Login from './components/Login';
import ErrorScreen from './components/ErrorScreen';
import { useGlobalEffects } from './hooks/useGlobalEffects';
import { sessionState } from './lib/api';

/** Espace membre FemzLab : Connexion | Erreur | Espace (nav, globe, DM, consentement). */
export default function App() {
  const navRef = useRef<CardNavHandle>(null);
  const [conv, setConv] = useState<string | null>(null);
  useGlobalEffects();
  const st = sessionState();
  return (
    <>
      <Aurora />
      <DotField />
      {st === 'error' && <ErrorScreen />}
      {st === 'anon' && <Login />}
      {st === 'auth' && (
        <>
          <CardNav ref={navRef} onOpenConv={setConv} />
          <GlobeSection />
          <div className="wrap" style={{ paddingTop: 0 }}>
            <footer><span>FemzLab — l’espace des créateurs</span><span>Support · Discord · femzlab.shop</span></footer>
          </div>
          <DmModal convId={conv} onClosed={() => setConv(null)} onBackToList={() => { setConv(null); navRef.current?.openDms(); }} />
          <ConsentModal />
        </>
      )}
      <GradualBlur />
    </>
  );
}
