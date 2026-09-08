import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import {
  ANON,
  CREATORS,
  chatId,
  creatorsTotal,
  creatorsVersion,
  initials,
  subscribeCreators,
  type Creator,
} from '../lib/creators';
import { NVDM } from '../lib/dm';
import { prefersReducedMotion } from '../lib/motion';
import { CloseX, FounderStar, Pin, SendPlane } from './Icons';

/* ── état de la carte ancrée ── */
type Pop =
  | { kind: 'profile'; idx: number }
  | { kind: 'chat'; idx: number }
  | { kind: 'list'; members: number[] }
  | null;

type GlobeState = {
  lam: number;
  phi: number;
  zoom: number;
  targetZoom: number;
  Wc: number;
  Hc: number;
  /** centre vertical du globe (px section) — calé entre le bloc titre et le bloc bas */
  cy: number;
  base: number;
  drag: { x: number; y: number; moved: number; l0: number; p0: number } | null;
  animT: { s: number; d: number; l0: number; l1: number; p0: number; p1: number; cb: (() => void) | null } | null;
  /* members = index CREATORS (confirmés) ; anon = nombre de points anonymes agrégés */
  clusters: { x: number; y: number; members: number[]; anon: number }[];
  edge: { x: number; y: number } | null;
};

/**
 * Le Globe — signature absolue de la section Communauté :
 * Terre vectorielle Natural Earth 110m rendue par d3-geo (orthographique,
 * clipAngle 90), halo « Orb », drag naturel 2 axes, zoom 1→8 (molette sur
 * la sphère uniquement + pinch), clusters chiffrés, carte profil ancrée au
 * marqueur (bounce iOS, ligne pointillée, flip aux bords), recherche → vol
 * animé, plein écran, chat morph FLIP dans la carte.
 */
export default function GlobeSection() {
  const secRef = useRef<HTMLElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const [ready, setReady] = useState(false);
  const [pop, setPop] = useState<Pop>(null);
  const [popNonce, setPopNonce] = useState(0);
  const [fs, setFs] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ c: Creator; j: number }[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatErr, setChatErr] = useState('');

  /* le chat de la carte se re-rend quand le store DM change */
  useSyncExternalStore(NVDM.subscribe, NVDM.version);
  /* le compteur/les points se re-rendent quand la liste des créateurs change
     (ex. re-fetch après consentement) */
  useSyncExternalStore(subscribeCreators, creatorsVersion);

  const st = useRef<GlobeState>({
    lam: -8,
    phi: -18,
    zoom: 1,
    targetZoom: 1,
    Wc: 0,
    Hc: 0,
    cy: 0,
    base: 0,
    drag: null,
    animT: null,
    clusters: [],
    edge: null,
  });
  const landRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const citiesRef = useRef<Record<string, [number, number]> | null>(null);
  const popMirror = useRef<Pop>(null);
  const fsMirror = useRef(false);
  const morphFrom = useRef<number | null>(null);
  useEffect(() => {
    popMirror.current = pop;
  }, [pop]);
  useEffect(() => {
    fsMirror.current = fs;
  }, [fs]);

  /* ── données : Terre + géocodeur ── */
  useEffect(() => {
    let dead = false;
    Promise.all([
      fetch('/espace/land110.geojson').then((r) => r.json()),
      fetch('/espace/cities.json').then((r) => r.json()),
    ]).then(([land, cities]) => {
      if (dead) return;
      landRef.current = land;
      citiesRef.current = cities;
      setReady(true);
    });
    return () => {
      dead = true;
    };
  }, []);

  /* ── actions (référencées par les handlers impératifs) ── */
  function flyToCoords(lon: number, lat: number, zoomTo: number | null, cb: (() => void) | null) {
    const s = st.current;
    const l1 = -lon;
    const p1 = -lat;
    const l0 = ((s.lam % 360) + 540) % 360 - 180;
    const dl = (((l1 - l0) % 360) + 540) % 360 - 180;
    s.animT = { s: performance.now(), d: prefersReducedMotion() ? 1 : 850, l0, l1: l0 + dl, p0: s.phi, p1, cb };
    s.lam = l0;
    if (zoomTo) s.targetZoom = zoomTo;
  }
  function openProfile(j: number) {
    setPop({ kind: 'profile', idx: j });
    setPopNonce((n) => n + 1); /* relance le bounce à chaque ouverture */
  }
  function openList(members: number[]) {
    setPop({ kind: 'list', members: members.slice() });
    setPopNonce((n) => n + 1);
  }
  function openChat(idx: number) {
    /* sans ce reset, l'erreur d'un envoi raté sur un chat précédent restait
       affichée en ouvrant celui d'un autre créateur */
    setChatErr('');
    const c = CREATORS[idx];
    const id = chatId(c);
    NVDM.open(id, c.n, c.founder);
    NVDM.read(id);
    /* FLIP : hauteur de départ mémorisée avant le morph */
    morphFrom.current = popRef.current?.offsetHeight ?? null;
    setPop({ kind: 'chat', idx });
  }
  function closePop() {
    setPop(null);
    setChatErr('');
    st.current.edge = null;
  }
  function flyTo(j: number) {
    closePop();
    const s = st.current;
    flyToCoords(CREATORS[j].lon, CREATORS[j].lat, s.targetZoom < 1.3 ? 1.45 : s.targetZoom, () => openProfile(j));
  }
  function maxSep(members: number[]) {
    let mx = 0;
    for (let a = 0; a < members.length; a++)
      for (let b = a + 1; b < members.length; b++) {
        const d = geoDistance(
          [CREATORS[members[a]].lon, CREATORS[members[a]].lat],
          [CREATORS[members[b]].lon, CREATORS[members[b]].lat],
        );
        if (d > mx) mx = d;
      }
    return mx;
  }
  function sameMembers(a: number[], b: number[]) {
    return a.length === b.length && a.every((x) => b.includes(x));
  }
  function clusterClick(cl: { x: number; y: number; members: number[] }) {
    const cur = popMirror.current;
    if (cl.members.length === 1) {
      const j = cl.members[0];
      /* re-clic sur le même point → la box dépop (toggle) */
      if (cur && cur.kind !== 'list' && cur.idx === j) {
        closePop();
        return;
      }
      openProfile(j);
      return;
    }
    if (cur && cur.kind === 'list' && sameMembers(cur.members, cl.members)) {
      closePop();
      return;
    }
    /* dispersés → zoom-séparation ; même ville → liste */
    if (maxSep(cl.members) > 0.0025 && st.current.targetZoom < 6) {
      let la = 0;
      let lo = 0;
      cl.members.forEach((m) => {
        la += CREATORS[m].lat;
        lo += CREATORS[m].lon;
      });
      la /= cl.members.length;
      lo /= cl.members.length;
      flyToCoords(lo, la, Math.min(8, st.current.targetZoom * 1.8), null);
    } else openList(cl.members);
  }
  /* body.globe-fs : la card nav se condense et le logo s'efface (CSS) */
  function enterFS() {
    setFs(true);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('globe-fs');
    if (st.current.targetZoom < 1.15) st.current.targetZoom = 1.15;
  }
  function exitFS() {
    setFs(false);
    document.body.style.overflow = '';
    document.body.classList.remove('globe-fs');
    st.current.targetZoom = 1;
    closePop();
  }
  useEffect(
    () => () => {
      document.body.style.overflow = '';
      document.body.classList.remove('globe-fs');
    },
    [],
  );

  const actions = useRef({ clusterClick, closePop, enterFS, exitFS });
  useEffect(() => {
    actions.current = { clusterClick, closePop, enterFS, exitFS };
  });

  /* ── positionnement de la carte ancrée (flip aux bords) ── */
  function placePop(ax: number, ay: number) {
    const el = popRef.current;
    const s = st.current;
    if (!el) return;
    if (matchMedia('(max-width:820px)').matches) {
      el.style.left = '';
      el.style.top = '';
      s.edge = null;
      return;
    }
    const pw = 284;
    const ph = el.offsetHeight || 300;
    let left = ax + 24;
    if (left + pw > s.Wc - 12) left = ax - 24 - pw;
    if (left < 12) left = 12;
    const top = Math.min(Math.max(ay - ph * 0.35, 14), Math.max(14, s.Hc - ph - 14));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    /* le bounce part du côté du marqueur */
    el.style.transformOrigin = `${left > ax ? 'left' : 'right'} ${Math.round(Math.min(Math.max(ay - top, 18), ph - 18))}px`;
    s.edge = { x: left > ax ? left : left + pw, y: Math.min(Math.max(ay, top + 18), top + ph - 18) };
  }
  /* position immédiate au commit (évite un flash en 0,0 après remount) */
  useLayoutEffect(() => {
    const cur = popMirror.current ?? pop;
    if (!cur) return;
    if (cur.kind === 'list') {
      let fx = 0;
      let fy = 0;
      let fn = 0;
      cur.members.forEach((m) => {
        const mc = CREATORS[m];
        if (mc.front && mc.sx !== undefined) {
          fx += mc.sx;
          fy += mc.sy!;
          fn++;
        }
      });
      if (fn) placePop(fx / fn, fy / fn);
    } else {
      const c = CREATORS[cur.idx];
      if (c.sx !== undefined) placePop(c.sx, c.sy!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop, popNonce]);

  /* ── morph FLIP profil → chat ── */
  useLayoutEffect(() => {
    if (pop?.kind !== 'chat' || morphFrom.current === null) return;
    const el = popRef.current!;
    const h0 = morphFrom.current;
    morphFrom.current = null;
    el.style.height = 'auto';
    const h1 = el.offsetHeight;
    el.style.height = `${h0}px`;
    void el.offsetHeight;
    el.style.height = `${h1}px`;
    const fin = (e: TransitionEvent) => {
      if (e.propertyName === 'height') {
        el.style.height = '';
        el.removeEventListener('transitionend', fin);
      }
    };
    el.addEventListener('transitionend', fin);
    chatInputRef.current?.focus();
  }, [pop]);

  /* scroll du chat en bas à chaque message */
  const chatConv = pop && pop.kind === 'chat' ? NVDM.get(chatId(CREATORS[pop.idx])) : undefined;
  const chatLen = chatConv?.msgs.length ?? 0;
  useEffect(() => {
    const sc = chatScrollRef.current;
    if (sc) sc.scrollTop = sc.scrollHeight;
  }, [chatLen, pop]);

  /* ── plein écran : recalcul du canvas après changement de layout ── */
  useLayoutEffect(() => {
    dispatchEvent(new Event('nv-globe-resize'));
  }, [fs]);

  /* ── boucle de rendu + interactions ── */
  useEffect(() => {
    if (!ready) return;
    const sec = secRef.current!;
    const cv = cvRef.current!;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const reduced = prefersReducedMotion();
    const s = st.current;
    const LAND = landRef.current!;
    const projection = geoOrthographic().clipAngle(90);
    const path = geoPath(projection, ctx);
    const grat = geoGraticule10();
    const SPHERE = { type: 'Sphere' } as const;
    let rafId = 0;

    /* Le globe se cale ENTRE le bloc titre (.g-top) et le bloc bas (.g-bottom) :
       centre au milieu de l'espace libre, rayon borné pour ne jamais passer
       sous les textes. En plein écran, les textes disparaissent : centre écran. */
    function resize() {
      s.Wc = sec.clientWidth;
      s.Hc = sec.clientHeight;
      cv.width = s.Wc * dpr;
      cv.height = s.Hc * dpr;
      cv.style.width = `${s.Wc}px`;
      cv.style.height = `${s.Hc}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* la classe est posée au même commit que l'événement nv-globe-resize */
      if (sec.classList.contains('fs')) {
        s.cy = s.Hc * 0.52;
        s.base = Math.min(s.Wc, s.Hc) * 0.36;
        return;
      }
      const top = topRef.current;
      const bot = botRef.current;
      const topH = top ? top.offsetTop + top.offsetHeight : s.Hc * 0.3;
      const botH = bot ? s.Hc - bot.offsetTop : 100;
      const avail = Math.max(240, s.Hc - topH - botH);
      s.cy = topH + avail / 2;
      s.base = Math.min(s.Wc * 0.36, avail / 2 - 8);
    }
    resize();
    /* polices / traduction / reflow : les blocs texte changent de hauteur */
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    if (ro) {
      ro.observe(sec);
      if (topRef.current) ro.observe(topRef.current);
    }

    function visible(c: Creator) {
      return geoDistance([c.lon, c.lat], [-s.lam, -s.phi]) < Math.PI / 2 - 0.03;
    }

    let wasZoomed = false;
    function draw(t: number) {
      s.zoom += (s.targetZoom - s.zoom) * 0.08;
      if (Math.abs(s.targetZoom - s.zoom) < 0.001) s.zoom = s.targetZoom;
      const isZoomed = s.zoom > 1.18;
      if (isZoomed !== wasZoomed) {
        wasZoomed = isZoomed;
        setZoomed(isZoomed);
      }
      if (s.animT) {
        const k = Math.min(1, (t - s.animT.s) / s.animT.d);
        const e2 = 1 - Math.pow(1 - k, 3);
        s.lam = s.animT.l0 + (s.animT.l1 - s.animT.l0) * e2;
        s.phi = s.animT.p0 + (s.animT.p1 - s.animT.p0) * e2;
        if (k >= 1) {
          const cb = s.animT.cb;
          s.animT = null;
          if (cb) cb();
        }
      } else if (popMirror.current === null && !s.drag && !reduced) {
        s.lam += 0.02; /* rotation ambiante */
      }
      projection.rotate([s.lam, s.phi]).translate([s.Wc / 2, s.cy]).scale(s.base * s.zoom);
      ctx.clearRect(0, 0, s.Wc, s.Hc);
      const R = s.base * s.zoom;
      const gx = s.Wc / 2;
      const gy = s.cy;
      /* halo façon Orb : anneau bleu→violet avec bloom, respiration lente */
      const br = reduced ? 1 : 0.88 + 0.12 * Math.sin(t / 900);
      const halo = ctx.createRadialGradient(gx, gy, R * 0.8, gx, gy, R * 1.5);
      halo.addColorStop(0, 'rgba(5,138,255,0)');
      halo.addColorStop(0.24, `rgba(5,138,255,${(0.06 * br).toFixed(3)})`);
      halo.addColorStop(0.29, `rgba(64,156,255,${(0.42 * br).toFixed(3)})`);
      halo.addColorStop(0.38, `rgba(94,162,245,${(0.22 * br).toFixed(3)})`);
      halo.addColorStop(0.56, `rgba(124,77,255,${(0.13 * br).toFixed(3)})`);
      halo.addColorStop(0.8, `rgba(33,0,99,${(0.06 * br).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(33,0,99,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(gx, gy, R * 1.5, 0, 7);
      ctx.fill();
      /* disque océan */
      ctx.beginPath();
      path(SPHERE);
      const gi = ctx.createRadialGradient(gx - R * 0.32, gy - R * 0.36, R * 0.1, gx, gy, R);
      gi.addColorStop(0, 'rgba(46,111,191,.12)');
      gi.addColorStop(1, 'rgba(24,8,64,.35)');
      ctx.fillStyle = gi;
      ctx.fill();
      /* graticule */
      ctx.beginPath();
      path(grat);
      ctx.strokeStyle = 'rgba(94,162,245,.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
      /* continents : remplissage + contour lumineux */
      ctx.beginPath();
      path(LAND);
      ctx.fillStyle = 'rgba(94,162,245,.10)';
      ctx.fill();
      ctx.shadowColor = 'rgba(94,162,245,.6)';
      ctx.shadowBlur = 9;
      ctx.strokeStyle = 'rgba(168,208,255,.85)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.shadowBlur = 0;
      /* limbe */
      ctx.beginPath();
      path(SPHERE);
      ctx.strokeStyle = 'rgba(120,180,255,.38)';
      ctx.lineWidth = 1;
      ctx.stroke();
      /* lueur atmosphérique interne */
      const rim = ctx.createRadialGradient(gx, gy, R * 0.9, gx, gy, R);
      rim.addColorStop(0, 'rgba(5,138,255,0)');
      rim.addColorStop(1, 'rgba(94,162,245,.24)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(gx, gy, R, 0, 7);
      ctx.fill();

      /* ── projection des créateurs + clustering écran (fusion < 26px) ── */
      s.clusters = [];
      for (let j = 0; j < CREATORS.length; j++) {
        const c = CREATORS[j];
        c.front = visible(c);
        if (!c.front) continue;
        const p = projection([c.lon, c.lat])!;
        c.sx = p[0];
        c.sy = p[1];
        let put = false;
        for (let q = 0; q < s.clusters.length; q++) {
          const cl = s.clusters[q];
          const dx = cl.x - c.sx;
          const dy = cl.y - c.sy;
          if (dx * dx + dy * dy < 26 * 26) {
            cl.members.push(j);
            cl.x = (cl.x * (cl.members.length - 1) + c.sx) / cl.members.length;
            cl.y = (cl.y * (cl.members.length - 1) + c.sy) / cl.members.length;
            put = true;
            break;
          }
        }
        if (!put) s.clusters.push({ x: c.sx, y: c.sy, members: [j], anon: 0 });
      }
      /* points anonymes (non consentants) : agrégés aux clusters proches —
         le chiffre les compte, la liste ne les affiche jamais */
      for (let j = 0; j < ANON.length; j++) {
        const a = ANON[j];
        a.front = geoDistance([a.lon, a.lat], [-s.lam, -s.phi]) < Math.PI / 2 - 0.03;
        if (!a.front) continue;
        const p = projection([a.lon, a.lat])!;
        a.sx = p[0];
        a.sy = p[1];
        let put = false;
        for (let q = 0; q < s.clusters.length; q++) {
          const cl = s.clusters[q];
          const dx = cl.x - a.sx;
          const dy = cl.y - a.sy;
          if (dx * dx + dy * dy < 26 * 26) {
            cl.anon++;
            put = true;
            break;
          }
        }
        if (!put) s.clusters.push({ x: a.sx, y: a.sy, members: [], anon: 1 });
      }
      /* dessin : point seul ou pastille chiffrée (les anonymes : plus petits,
         plus ternes, sans pulse — et jamais cliquables) */
      const cur = popMirror.current;
      for (let q = 0; q < s.clusters.length; q++) {
        const cl = s.clusters[q];
        const n = cl.members.length + cl.anon;
        const isSel =
          (cur && cur.kind !== 'list' && cl.members.indexOf(cur.idx) > -1) ||
          (cur && cur.kind === 'list' && cl.members.some((m) => cur.members.indexOf(m) > -1)) ||
          false;
        if (cl.members.length === 0) {
          if (cl.anon === 1) {
            /* point anonyme : petit, terne, statique */
            ctx.fillStyle = 'rgba(126,152,190,.14)';
            ctx.beginPath();
            ctx.arc(cl.x, cl.y, 5, 0, 7);
            ctx.fill();
            ctx.fillStyle = 'rgba(148,168,196,.55)';
            ctx.beginPath();
            ctx.arc(cl.x, cl.y, 2.3, 0, 7);
            ctx.fill();
          } else {
            /* pastille 100 % anonyme : chiffrée mais éteinte */
            const r = 10 + Math.min(4, cl.anon);
            ctx.fillStyle = '#10141B';
            ctx.beginPath();
            ctx.arc(cl.x, cl.y, r, 0, 7);
            ctx.fill();
            ctx.strokeStyle = 'rgba(126,132,141,.45)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(cl.x, cl.y, r, 0, 7);
            ctx.stroke();
            ctx.fillStyle = '#7E848D';
            ctx.font = '600 11px "Instrument Sans",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(cl.anon), cl.x, cl.y + 0.5);
          }
        } else if (n === 1) {
          const pulse = reduced ? 1 : 0.75 + 0.25 * Math.sin(t / 400 + cl.members[0]);
          ctx.fillStyle = `rgba(94,162,245,${isSel ? 0.32 : 0.15})`;
          ctx.beginPath();
          ctx.arc(cl.x, cl.y, (isSel ? 13 : 9) * pulse, 0, 7);
          ctx.fill();
          ctx.fillStyle = isSel ? '#DCEBFF' : '#9CCBFF';
          ctx.beginPath();
          ctx.arc(cl.x, cl.y, isSel ? 4.6 : 3.6, 0, 7);
          ctx.fill();
        } else {
          const r = 13 + Math.min(5, n);
          const pulse2 = reduced ? 1 : 0.85 + 0.15 * Math.sin(t / 450 + q);
          ctx.fillStyle = `rgba(94,162,245,${isSel ? 0.3 : 0.16})`;
          ctx.beginPath();
          ctx.arc(cl.x, cl.y, (r + 6) * pulse2, 0, 7);
          ctx.fill();
          ctx.fillStyle = '#0E1420';
          ctx.beginPath();
          ctx.arc(cl.x, cl.y, r, 0, 7);
          ctx.fill();
          ctx.strokeStyle = isSel ? '#DCEBFF' : 'rgba(94,162,245,.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cl.x, cl.y, r, 0, 7);
          ctx.stroke();
          ctx.fillStyle = '#DCEBFF';
          ctx.font = '700 12px "Instrument Sans",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(n), cl.x, cl.y + 0.5);
        }
      }

      /* ── carte ancrée : suit son marqueur, ligne pointillée ── */
      if (cur !== null) {
        let ax: number | null = null;
        let ay: number | null = null;
        if (cur.kind !== 'list') {
          const pc = CREATORS[cur.idx];
          if (!pc.front) actions.current.closePop();
          else {
            ax = pc.sx!;
            ay = pc.sy!;
          }
        } else {
          let fx = 0;
          let fy = 0;
          let fn = 0;
          cur.members.forEach((m) => {
            const mc = CREATORS[m];
            if (mc.front) {
              fx += mc.sx!;
              fy += mc.sy!;
              fn++;
            }
          });
          if (!fn) actions.current.closePop();
          else {
            ax = fx / fn;
            ay = fy / fn;
          }
        }
        if (ax !== null && ay !== null) {
          placePop(ax, ay);
          if (s.edge) {
            ctx.strokeStyle = 'rgba(94,162,245,.45)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(s.edge.x, s.edge.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);

    /* ── interactions ── */
    function pos(e: { clientX: number; clientY: number }) {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function overSphere(e: { clientX: number; clientY: number }) {
      const p = pos(e);
      const dx = p.x - s.Wc / 2;
      const dy = p.y - s.cy;
      return Math.sqrt(dx * dx + dy * dy) < s.base * s.zoom + 20;
    }
    function hitCluster(e: { clientX: number; clientY: number }) {
      const p = pos(e);
      let best: GlobeState['clusters'][number] | null = null;
      let bd = 1e9;
      for (let q = 0; q < s.clusters.length; q++) {
        const cl = s.clusters[q];
        if (!cl.members.length) continue; /* 100 % anonyme : non cliquable, pas de curseur */
        const dx = p.x - cl.x;
        const dy = p.y - cl.y;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = cl;
        }
      }
      return bd < 26 * 26 ? best : null;
    }
    function startDrag(x: number, y: number) {
      s.drag = { x, y, moved: 0, l0: s.lam, p0: s.phi };
      s.animT = null;
    }
    function moveDrag(x: number, y: number) {
      if (!s.drag) return;
      const dx = x - s.drag.x;
      const dy = y - s.drag.y;
      s.drag.moved = Math.max(s.drag.moved, Math.abs(dx) + Math.abs(dy));
      const k = 0.22 / s.zoom; /* sensibilité ÷ zoom */
      s.lam = s.drag.l0 + dx * k;
      s.phi = Math.max(-80, Math.min(80, s.drag.p0 - dy * k));
    }
    function endDrag(e: MouseEvent | null) {
      if (!s.drag) return;
      const wasClick = s.drag.moved < 6;
      s.drag = null;
      cv.style.cursor = 'grab';
      if (wasClick && e) {
        const h = hitCluster(e);
        if (h) actions.current.clusterClick(h);
        else actions.current.closePop();
      }
    }
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      cv.style.cursor = 'grabbing';
      const p = pos(e);
      startDrag(p.x, p.y);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (s.drag) {
        const p = pos(e);
        moveDrag(p.x, p.y);
        return;
      }
      if (e.target === cv) cv.style.cursor = hitCluster(e) ? 'pointer' : 'grab';
    };
    const onMouseUp = (e: MouseEvent) => {
      endDrag(e.target === cv ? e : null);
    };
    /* tactile : 1 doigt = rotation · 2 doigts = pinch zoom */
    let pinch: { d: number; z: number } | null = null;
    function tDist(ts: TouchList) {
      const dx = ts[0].clientX - ts[1].clientX;
      const dy = ts[0].clientY - ts[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        s.drag = null;
        pinch = { d: tDist(e.touches), z: s.targetZoom };
        return;
      }
      const t = e.touches[0];
      const r = cv.getBoundingClientRect();
      startDrag(t.clientX - r.left, t.clientY - r.top);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        s.targetZoom = Math.max(1, Math.min(8, pinch.z * (tDist(e.touches) / pinch.d)));
        return;
      }
      const t = e.touches[0];
      const r = cv.getBoundingClientRect();
      moveDrag(t.clientX - r.left, t.clientY - r.top);
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (s.drag && s.drag.moved < 6) {
        const t = e.changedTouches[0];
        const h = hitCluster(t);
        s.drag = null;
        if (h) actions.current.clusterClick(h);
        else actions.current.closePop();
      } else s.drag = null;
    };
    /* zoom molette : uniquement sur la sphère */
    const onWheel = (e: WheelEvent) => {
      if (!overSphere(e)) return;
      e.preventDefault();
      s.targetZoom = Math.max(1, Math.min(8, s.targetZoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fsMirror.current) actions.current.exitFS();
        else {
          actions.current.closePop();
          s.targetZoom = 1;
        }
      }
    };
    const onGlobeResize = () => resize();

    cv.addEventListener('mousedown', onMouseDown);
    addEventListener('mousemove', onMouseMove, { passive: true });
    addEventListener('mouseup', onMouseUp);
    cv.addEventListener('touchstart', onTouchStart, { passive: true });
    cv.addEventListener('touchmove', onTouchMove, { passive: false });
    cv.addEventListener('touchend', onTouchEnd, { passive: true });
    cv.addEventListener('wheel', onWheel, { passive: false });
    addEventListener('keydown', onKey);
    addEventListener('resize', onGlobeResize);
    addEventListener('nv-globe-resize', onGlobeResize);

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      cv.removeEventListener('mousedown', onMouseDown);
      removeEventListener('mousemove', onMouseMove);
      removeEventListener('mouseup', onMouseUp);
      cv.removeEventListener('touchstart', onTouchStart);
      cv.removeEventListener('touchmove', onTouchMove);
      cv.removeEventListener('touchend', onTouchEnd);
      cv.removeEventListener('wheel', onWheel);
      removeEventListener('keydown', onKey);
      removeEventListener('resize', onGlobeResize);
      removeEventListener('nv-globe-resize', onGlobeResize);
    };
  }, [ready]);

  /* ── recherche ── */
  function search(q: string) {
    setQuery(q);
    const needle = q.trim().toLowerCase().replace(/^@/, '');
    if (!needle) {
      setResults([]);
      return;
    }
    const res: { c: Creator; j: number }[] = [];
    CREATORS.forEach((c, j) => {
      if (c.n.toLowerCase().includes(needle) || c.h.toLowerCase().includes(needle)) res.push({ c, j });
    });
    setResults(res.slice(0, 6));
  }
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!(e.target as Element).closest?.('.g-search')) setResults([]);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  /* ── envoi chat ── */
  /* Envoi optimiste : si le serveur refuse (DM fermés, blocage, 429), le store
     retire le message et relance l'erreur — sans ce catch, elle disparaissait
     sans un mot et la promesse restait rejetée. */
  function sendChat() {
    if (!pop || pop.kind !== 'chat') return;
    const envoye = chatText;
    const v = envoye.trim();
    if (!v) return;
    setChatErr('');
    /* le champ n'est vidé qu'après succès, et seulement s'il contient encore
       exactement ce qui a été envoyé : en cas de refus serveur — ou si
       l'utilisateur a retapé autre chose pendant l'envoi — le texte reste. */
    void NVDM.send(chatId(CREATORS[pop.idx]), v)
      .then(() => setChatText((cur) => (cur === envoye ? '' : cur)))
      .catch((e) => setChatErr(e?.message || 'Message non envoyé'));
  }

  /* ── contenus de la carte ancrée ── */
  function renderPop() {
    if (!pop) return null;
    if (pop.kind === 'list') {
      const city = CREATORS[pop.members[0]].city;
      return (
        <>
          <button className="x" aria-label="Fermer" onClick={(e) => { e.stopPropagation(); closePop(); }}>
            <CloseX />
          </button>
          <p className="gp-count">{pop.members.length} créateurs ici</p>
          <p className="gp-city">
            <Pin /> {city}
          </p>
          <div className="gp-list">
            {pop.members.map((m) => (
              <button key={m} onClick={() => openProfile(m)}>
                <span className="mav">{initials(CREATORS[m])}</span>
                {CREATORS[m].n}
                <span>{CREATORS[m].h}</span>
              </button>
            ))}
          </div>
        </>
      );
    }
    const c = CREATORS[pop.idx];
    if (pop.kind === 'chat') {
      const conv = NVDM.get(chatId(c));
      return (
        <>
          <button className="x" aria-label="Fermer" onClick={(e) => { e.stopPropagation(); closePop(); }}>
            <CloseX />
          </button>
          <div className="dm-head">
            <span className="dm-av" style={c.av ? { backgroundImage: `url(${c.av})` } : undefined}>
              {c.av ? '' : initials(c)}
            </span>
            <b>{c.n}</b>
          </div>
          <div className="dm-msgs" ref={chatScrollRef}>
            {(conv?.msgs || []).map((m, i) => (
              <div key={i} className={'bub ' + (m.f === 'me' ? 'me' : 'them')}>
                {m.x}
                <time>{NVDM.fmt(m.t)}</time>
              </div>
            ))}
          </div>
          <div className="dm-input">
            <input
              ref={chatInputRef}
              type="text"
              placeholder={`Écris à ${c.n}…`}
              aria-label="Message"
              value={chatText}
              onChange={(e) => { setChatText(e.target.value); if (chatErr) setChatErr(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat();
              }}
            />
            <button className="dm-send" aria-label="Envoyer" onClick={sendChat}>
              <SendPlane />
            </button>
          </div>
          {chatErr && <p className="login-err dm-err" role="alert">{chatErr}</p>}
        </>
      );
    }
    /* profil */
    return (
      <>
        <button className="x" aria-label="Fermer" onClick={(e) => { e.stopPropagation(); closePop(); }}>
          <CloseX />
        </button>
        <div className="gp-head">
          <span
            className="gp-av"
            style={c.av ? { backgroundImage: `url(${c.av})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            {c.av ? '' : initials(c)}
          </span>
          <div>
            <b>
              {c.n}
              {c.founder && (
                <>
                  {' '}
                  <FounderStar />
                </>
              )}
            </b>
            <span>{c.h}</span>
          </div>
        </div>
        <p className="gp-city">
          <Pin /> {c.city}
        </p>
        <p className="gp-stats">{c.stats}</p>
        <div className="gp-forms">
          {c.f.map((f) => (
            <span key={f} className={'fbadge ' + (f.includes('NéoVision') ? 'fb-neo' : 'fb-meta')}>
              {f}
            </span>
          ))}
        </div>
        {c.reels && c.reels.length > 0 && (
          <div className="gp-reels">
            {c.reels.map((r, i) => (
              <a
                key={i}
                /* pas de lien si l'URL n'est pas http(s) : href n'exécute jamais un javascript: */
                href={/^https?:\/\//i.test(r.url) ? r.url : undefined}
                target="_blank"
                rel="noopener noreferrer"
                title="Voir le reel"
                style={r.thumb ? { backgroundImage: `url(${r.thumb})` } : undefined}
              />
            ))}
          </div>
        )}
        {c.socials && (c.socials.ig || c.socials.tt || c.socials.yt) ? (
          <div className="gp-socials">
            {c.socials.ig && (
              <a href={`https://instagram.com/${c.socials.ig.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            )}
            {c.socials.tt && (
              <a href={`https://tiktok.com/@${c.socials.tt.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">
                TikTok
              </a>
            )}
            {c.socials.yt && (
              <a href={`https://youtube.com/@${c.socials.yt.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer">
                YouTube
              </a>
            )}
          </div>
        ) : !c.socials ? (
          <div className="gp-socials">
            <a href="#">Instagram</a>
            <a href="#">TikTok</a>
            <a href="#">YouTube</a>
          </div>
        ) : null}
        <button className="btn btn-acc btn-sm gp-dm" onClick={() => openChat(pop.idx)}>
          Envoyer un DM
        </button>
      </>
    );
  }

  return (
    <section
      id="globe"
      ref={secRef as MutableRefObject<HTMLElement | null>}
      className={'commu' + (fs ? ' fs' : '') + (zoomed ? ' zoomed' : '')}
    >
      <canvas
        id="globeC"
        ref={cvRef}
        aria-label="Globe 3D de la communauté — glisse pour tourner, molette pour zoomer, clique un créateur"
      />
      <div className="g-top g-fade" ref={topRef}>
        {/* eyebrow live → titre → texte → recherche */}
        <span className="live">
          <span className="pulse-dot" /> {creatorsTotal()} {creatorsTotal() > 1 ? 'créateurs' : 'créateur'} · MetaVision &amp; NéoVision
        </span>
        <h2>La communauté, en direct</h2>
        <p>Chaque point est un vrai client FemzLab. Attrape le globe, zoome, clique.</p>
        <div className="g-search">
          <input
            type="search"
            placeholder="Rechercher un créateur… (@pseudo)"
            autoComplete="off"
            aria-label="Rechercher un créateur"
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                setResults([]);
              }
            }}
          />
          <div className={'gsr' + (results.length ? ' on' : '')} role="listbox">
            {results.map(({ c, j }) => (
              <button
                key={j}
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  flyTo(j);
                }}
              >
                <span className="mav">{initials(c)}</span>
                {c.n} <span>{c.h}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        key={popNonce}
        ref={popRef}
        className={'gpop' + (pop ? ' on' : '') + (pop?.kind === 'chat' ? ' chat' : '')}
        role="dialog"
        aria-label="Profil du créateur"
      >
        {renderPop()}
      </div>
      <div className="g-bottom g-fade" ref={botRef}>
        <span className="g-hint">Glisse pour tourner · molette pour zoomer · clique un point</span>
        <button className="btn ghost g-expand" onClick={enterFS}>
          Explorer le globe
        </button>
      </div>
      <button
        className="btn ghost btn-sm g-reset"
        onClick={() => {
          if (fs) exitFS();
          else {
            st.current.targetZoom = 1;
            closePop();
          }
        }}
      >
        {fs ? 'Réduire le globe' : 'Dézoomer'}
      </button>
    </section>
  );
}
