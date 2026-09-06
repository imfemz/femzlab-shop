import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from './Icons';

/**
 * Hero — vidéo centrale 16:9 (max 860px) + carte épisode dépliante centrée.
 */
export default function Hero() {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  /* hauteur animée (transition CSS sur .ep-body) */
  useEffect(() => {
    const body = bodyRef.current!;
    body.style.height = open ? `${body.scrollHeight}px` : '0px';
    if (!open) return;
    const onResize = () => {
      body.style.height = `${body.scrollHeight}px`;
    };
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, [open]);

  return (
    <div className="hero-v">
      <div className="hero-video glow" role="img" aria-label="Épisode 3.2 — lecteur vidéo">
        <div className="thumb" />
        <div className="play" />
        <span className="len">04:38</span>
      </div>
      <div className={'ep-card glow' + (open ? ' open' : '')}>
        <div className="ep-bar" onClick={() => setOpen((o) => !o)}>
          <span className="eyebrow">Module 3 · En cours</span>
          <h1>3.2 — Contrôler le mouvement et la caméra</h1>
          <button
            className="chev"
            aria-expanded={open}
            aria-label="Déplier les infos de l'épisode"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            <ChevronDown />
          </button>
        </div>
        <div className="ep-body" ref={bodyRef}>
          <div className="ep-body-in">
            <p>
              Push in, orbit, handheld : le vocabulaire qui transforme une animation molle en plan
              intentionnel.
            </p>
            <div className="cta-row">
              <button className="btn btn-acc">Reprendre l'épisode</button>
              <div className="mod-progress">
                <div className="bar">
                  <i />
                </div>{' '}
                2/4 épisodes du module
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
