import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/**
 * DotField — champ de points froid plein écran (opacité .45 via CSS) :
 * spacing 30 · rayon dessiné 1.3 · bulge curseur (force 67, rayon 400) ·
 * halo sombre #0c184b r220 qui suit la souris (opacité liée à la vitesse).
 * + bande #dots2 : copie NETTE des 112px du bas, au-dessus du GradualBlur,
 *   qui s'efface quand le globe entre dans la zone.
 */
export default function DotField() {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const cv2Ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = cvRef.current!;
    const cv2 = cv2Ref.current!;
    const ctx = cv.getContext('2d', { alpha: true })!;
    const ctx2 = cv2.getContext('2d', { alpha: true })!;
    const STRIP = 112;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = prefersReducedMotion();
    /* config DotField validée (maquette v30) */
    const SPACING = 30;
    const R = 2;
    const CR = 400;
    const BULGE = 67;
    const GLOWR = 220;
    const RAD = 1.3;

    type Dot = { ax: number; ay: number; sx: number; sy: number };
    let dots: Dot[] = [];
    let W = 0;
    let H = 0;
    const m = { x: -9999, y: -9999, px: -9999, py: -9999, speed: 0 };
    let eng = 0;
    let gop = 0;
    let frame = 0;
    let rafId = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    function sizeStrip() {
      cv2.width = W * dpr;
      cv2.height = STRIP * dpr;
    }
    function blitStrip() {
      ctx2.clearRect(0, 0, cv2.width, cv2.height);
      ctx2.drawImage(cv, 0, (H - STRIP) * dpr, W * dpr, STRIP * dpr, 0, 0, W * dpr, STRIP * dpr);
    }
    function build() {
      const step = R + SPACING;
      const cols = Math.floor(W / step);
      const rows = Math.floor(H / step);
      const padX = (W % step) / 2;
      const padY = (H % step) / 2;
      dots = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const ax = padX + c * step + step / 2;
          const ay = padY + r * step + step / 2;
          dots.push({ ax, ay, sx: ax, sy: ay });
        }
    }
    function setup() {
      W = innerWidth;
      H = innerHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeStrip();
      build();
    }
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setup();
        if (reduced) {
          drawOnce();
          blitStrip();
        }
      }, 100);
    }

    function onMove(e: MouseEvent) {
      m.x = e.clientX;
      m.y = e.clientY;
    }
    /* vitesse du curseur → intensité du champ */
    const speedTimer = setInterval(() => {
      const dx = m.px - m.x;
      const dy = m.py - m.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      m.speed += (d - m.speed) * 0.5;
      if (m.speed < 0.001) m.speed = 0;
      m.px = m.x;
      m.py = m.y;
    }, 20);

    function paint() {
      ctx.clearRect(0, 0, W, H);
      gop += (eng - gop) * 0.08;
      /* halo sombre qui suit le curseur */
      if (gop > 0.01) {
        const gg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, GLOWR);
        gg.addColorStop(0, `rgba(12,24,75,${(0.9 * gop).toFixed(3)})`);
        gg.addColorStop(1, 'rgba(12,24,75,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(m.x, m.y, GLOWR, 0, 6.2832);
        ctx.fill();
      }
      /* dégradé validé : #3FA2FF → #7A63E8 (jamais de violet trop sombre) */
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#3FA2FF');
      g.addColorStop(1, '#7A63E8');
      ctx.fillStyle = g;
      const crSq = CR * CR;
      ctx.beginPath();
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const dx = m.x - d.ax;
        const dy = m.y - d.ay;
        const distSq = dx * dx + dy * dy;
        if (distSq < crSq && eng > 0.01) {
          const dist = Math.sqrt(distSq);
          const k = 1 - dist / CR;
          const push = k * k * BULGE * eng;
          const ang = Math.atan2(dy, dx);
          d.sx += (d.ax - Math.cos(ang) * push - d.sx) * 0.15;
          d.sy += (d.ay - Math.sin(ang) * push - d.sy) * 0.15;
        } else {
          d.sx += (d.ax - d.sx) * 0.1;
          d.sy += (d.ay - d.sy) * 0.1;
        }
        ctx.moveTo(d.sx + RAD, d.sy);
        ctx.arc(d.sx, d.sy, RAD, 0, 6.2832);
      }
      ctx.fill();
    }

    /* la bande nette s'efface quand le globe entre dans la zone de flou */
    function stripCheck() {
      const gsec = document.getElementById('globe');
      if (!gsec) return;
      const r = gsec.getBoundingClientRect();
      const bandTop = innerHeight - STRIP;
      cv2.style.opacity = r.bottom > bandTop && r.top < innerHeight ? '0' : '1';
    }

    function tick() {
      frame++;
      const target = Math.min(m.speed / 5, 1);
      eng += (target - eng) * 0.06;
      if (eng < 0.001) eng = 0;
      paint();
      blitStrip();
      rafId = requestAnimationFrame(tick);
    }
    function drawOnce() {
      eng = 0;
      paint();
    }

    setup();
    addEventListener('mousemove', onMove, { passive: true });
    addEventListener('resize', onResize);
    addEventListener('scroll', stripCheck, { passive: true });
    stripCheck();
    if (reduced) {
      drawOnce();
      blitStrip();
    } else {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(speedTimer);
      clearTimeout(resizeTimer);
      removeEventListener('mousemove', onMove);
      removeEventListener('resize', onResize);
      removeEventListener('scroll', stripCheck);
    };
  }, []);

  return (
    <>
      <canvas id="dots" ref={cvRef} aria-hidden="true" />
      <canvas id="dots2" ref={cv2Ref} aria-hidden="true" />
    </>
  );
}
