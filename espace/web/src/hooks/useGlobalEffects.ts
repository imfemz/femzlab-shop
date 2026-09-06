import { useEffect } from 'react';
import { hasFinePointer, prefersReducedMotion } from '../lib/motion';

/**
 * Effets globaux de la page (valeurs v30) :
 * - Parallax de scroll : les blocs près du bas émergent (+6 %, retard 26px,
 *   fondu −22 %, zone 400px) ; léger éloignement en haut (−1.4 %, zone 180px).
 * - Reveal : entrée en blur 14px→0 (IntersectionObserver).
 * - Glow borders Magic Bento : la bordure suit la souris (--mx/--my).
 * - Tilt 3D discret : blocs médias uniquement (amplitude 5, scale 1.01).
 */
export function useGlobalEffects() {
  /* ── profondeur au scroll ── */
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('.hero-v,.sec-head,.mods-bar,.packs,.slider-clip,footer'),
    );
    els.forEach((el) => {
      el.style.transformOrigin = '50% 100%';
      el.style.willChange = 'transform';
    });
    const ZONE = 400;
    const MAX = 0.06;
    const LIFT = 26;
    const TOPZONE = 180;
    let raf: number | null = null;
    function apply() {
      raf = null;
      const vh = innerHeight;
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top > vh + 120 || r.bottom < -40) {
          if (el.style.transform) {
            el.style.transform = '';
            el.style.opacity = '';
          }
          return;
        }
        const c = (r.top + r.bottom) / 2;
        /* bas : les blocs émergent — zoom + retard parallax + fondu d'entrée */
        const k = 1 - Math.min(Math.max((vh - c) / ZONE, 0), 1);
        /* haut : les blocs s'éloignent légèrement en sortant sous la nav */
        const k2 = 1 - Math.min(Math.max((c - 90) / TOPZONE, 0), 1);
        const sc = 1 + MAX * k - 0.014 * k2;
        const ty = LIFT * k;
        const o = 1 - 0.22 * k - 0.1 * k2;
        el.style.transform =
          k > 0.001 || k2 > 0.001 ? `translateY(${ty.toFixed(1)}px) scale(${sc.toFixed(4)})` : '';
        el.style.opacity = k > 0.001 || k2 > 0.001 ? o.toFixed(3) : '';
      });
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', apply);
    apply();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', apply);
      els.forEach((el) => {
        el.style.transform = '';
        el.style.opacity = '';
        el.style.willChange = '';
      });
    };
  }, []);

  /* ── reveal : entrée en blur ── */
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            obs.unobserve(en.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, []);

  /* ── glow borders : délégation (fonctionne aussi sur les éléments montés après) ── */
  useEffect(() => {
    if (!hasFinePointer()) return;
    function onMove(e: MouseEvent) {
      const el = (e.target as Element).closest?.('.glow') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  /* ── tilt 3D léger (blocs médias uniquement) ── */
  useEffect(() => {
    if (!hasFinePointer() || prefersReducedMotion()) return;
    const AMP = 5;
    const SCALE = 1.01;
    function onMove(e: MouseEvent) {
      const el = (e.target as Element).closest?.('.hero-video,.t-card,.pack') as HTMLElement | null;
      if (!el) return;
      if (!el.dataset.tilt) {
        el.dataset.tilt = '1';
        el.style.transition = 'transform .18s ease-out';
        el.addEventListener('mouseleave', () => {
          el.style.transform = '';
        });
      }
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left - r.width / 2;
      const oy = e.clientY - r.top - r.height / 2;
      const rx = (oy / (r.height / 2)) * -AMP;
      const ry = (ox / (r.width / 2)) * AMP;
      el.style.transform = `perspective(750px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${SCALE})`;
    }
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);
}
