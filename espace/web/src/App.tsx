import { useRef, useState } from 'react';
import Aurora from './components/Aurora';
import DotField from './components/DotField';
import CardNav, { type CardNavHandle } from './components/CardNav';
import DmModal from './components/DmModal';
import Hero from './components/Hero';
import Modules from './components/Modules';
import Packs from './components/Packs';
import Upsell from './components/Upsell';
import ConsentModal from './components/ConsentModal';
import GlobeSection from './components/GlobeSection';
import TestimonialsSlider from './components/TestimonialsSlider';
import GradualBlur from './components/GradualBlur';
import { useGlobalEffects } from './hooks/useGlobalEffects';
import { hasSession, hasNeovision } from './lib/api';

/**
 * NéoVision — Espace élève (parité maquette v30).
 * Pile visuelle : Aurora sous DotField (fixes, z-0) → contenu → GradualBlur
 * bas de page (z-50) + bande dots2 nette (z-51) → footer net (z-60).
 */
export default function App() {
  const navRef = useRef<CardNavHandle>(null);
  const [conv, setConv] = useState<string | null>(null);

  useGlobalEffects();

  /* Le cours ne s'affiche que pour un membre NéoVision. Sans session (mode démo
   * sans backend) tout reste visible. Un membre communauté (ex. MetaVision) voit
   * l'upsell à la place de Hero/Modules/Packs, mais garde le globe et ses DM. */
  const showCourse = !hasSession() || hasNeovision();

  return (
    <>
      <Aurora />
      <DotField />

      <CardNav ref={navRef} onOpenConv={setConv} />

      <div className="wrap">
        {showCourse ? (
          <>
            <Hero />
            <Modules />
            <Packs />
          </>
        ) : (
          <Upsell />
        )}
      </div>

      <GlobeSection />

      <div className="wrap" style={{ paddingTop: 0 }}>
        <TestimonialsSlider />
        <footer>
          <span>NéoVision — une formation FemzLab</span>
          <span>Support · Discord · femzlab.shop</span>
        </footer>
      </div>

      <DmModal
        convId={conv}
        onClosed={() => setConv(null)}
        onBackToList={() => {
          setConv(null);
          navRef.current?.openDms();
        }}
      />
      <GradualBlur />
      <ConsentModal />
    </>
  );
}
