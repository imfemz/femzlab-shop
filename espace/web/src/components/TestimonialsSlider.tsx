import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from './Icons';

type Slide = {
  views: string;
  intro: string;
  quote: string;
  ini: string;
  name: string;
  handle: string;
};

const SLIDES: Slide[] = [
  {
    views: 'Reel de Léa · 48K vues',
    intro: 'Léa raconte…',
    quote: '« J\'ai publié mon premier reel VFX trois jours après avoir commencé. 48 000 vues. »',
    ini: 'LA',
    name: 'Léa',
    handle: '@lea.creates',
  },
  {
    views: 'Reel de Maxime · 112K vues',
    intro: 'Maxime raconte…',
    quote: '« Prompt Mastery a changé ma façon de bosser. Deux essais au lieu de vingt. »',
    ini: 'MX',
    name: 'Maxime',
    handle: '@max.motion',
  },
  {
    views: 'Reel de Sarah · 27K vues',
    intro: 'Sarah raconte…',
    quote: '« Le Discord et le globe, c\'est ce qui me fait rester. On se pousse vers le haut. »',
    ini: 'SA',
    name: 'Sarah',
    handle: '@sarah.fx',
  },
];

/**
 * Témoignages — slider à flèches (desktop) / points + swipe (mobile).
 */
export default function TestimonialsSlider() {
  const [cur, setCur] = useState(0);
  const [step, setStep] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const n = SLIDES.length;

  useEffect(() => {
    function measure() {
      const track = trackRef.current;
      const card = track?.firstElementChild as HTMLElement | null;
      if (!track || !card) return;
      const gap = parseFloat(getComputedStyle(track).gap) || 10;
      setStep(card.offsetWidth + gap);
    }
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, []);

  const go = (k: number) => setCur(Math.max(0, Math.min(n - 1, k)));

  return (
    <section id="reels" className="t-sec">
      <div className="sec-head">
        <h2 className="reveal">Ils créent avec NéoVision</h2>
        <div className="arrows">
          <button className="arrow" aria-label="Témoignage précédent" disabled={cur === 0} onClick={() => go(cur - 1)}>
            <ArrowLeft />
          </button>
          <button className="arrow" aria-label="Témoignage suivant" disabled={cur === n - 1} onClick={() => go(cur + 1)}>
            <ArrowRight />
          </button>
        </div>
      </div>
      <div className="slider-clip">
        <div
          className="slider-track"
          ref={trackRef}
          style={{ transform: `translateX(-${cur * step}px)` }}
          onTouchStart={(e) => {
            startX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (startX.current === null) return;
            const dx = e.changedTouches[0].clientX - startX.current;
            if (dx < -40) go(cur + 1);
            else if (dx > 40) go(cur - 1);
            startX.current = null;
          }}
        >
          {SLIDES.map((s) => (
            <div className="t-slide" key={s.name}>
              <div className="t-card glow">
                <div className="t-media">
                  <div className="play" />
                  <span className="views">{s.views}</span>
                </div>
                <div className="t-body">
                  <span className="t-intro">{s.intro}</span>
                  <p className="t-quote">{s.quote}</p>
                  <div className="t-author">
                    <span className="pav">{s.ini}</span>
                    <div>
                      <b>{s.name}</b>
                      <span>{s.handle}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="s-dots">
        {SLIDES.map((s, i) => (
          <button
            key={s.name}
            className={i === cur ? 'on' : ''}
            aria-label={`Aller au témoignage ${i + 1}`}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </section>
  );
}
