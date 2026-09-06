import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { NVDM } from '../lib/dm';
import { profileStore, type ProfileData, type ProfileReel } from '../lib/profile';
import { prefersReducedMotion } from '../lib/motion';
import { MessageBubble, Pencil } from './Icons';
import { getMe, saveConsent } from '../lib/api';

gsap.registerPlugin(CustomEase);
/* l'ease maison de la marque : cubic-bezier(.22,1,.36,1) */
const nvEase = CustomEase.create('nvNav', '0.22,1,0.36,1');

type Panel = 'menu' | 'profile' | 'msgs' | null;

export type CardNavHandle = {
  /** Ouvre le panneau messages (retour depuis la modale DM). */
  openDms: () => void;
};

type Props = {
  /** Ouvre une conversation en modale détachée. */
  onOpenConv: (id: string) => void;
};

const RING_CIRC = 314.16;
const RING_PROG = 0.38;

/**
 * CardNav — barre flottante Glass Surface qui se déplie :
 * menu 3 cartes (GSAP), panneau profil « Mon espace », liste des messages.
 * Un seul panneau ouvert à la fois ; Échap et clic extérieur referment.
 */
const CardNav = forwardRef<CardNavHandle, Props>(function CardNav({ onOpenConv }, ref) {
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const pctRef = useRef<SVGTextElement>(null);
  const ringDone = useRef(false);

  const [panel, setPanel] = useState<Panel>(null);
  const [saveLabel, setSaveLabel] = useState('Enregistrer');

  /* ── profil (restauré depuis le stockage) ── */
  const saved = useRef<ProfileData | null>(profileStore.load());
  const [city, setCity] = useState(saved.current?.city || 'Paris, France');
  const [ig, setIg] = useState(saved.current?.socials?.ig ?? '@imfemz');
  const [tt, setTt] = useState(saved.current?.socials?.tt ?? '');
  const [yt, setYt] = useState(saved.current?.socials?.yt ?? '@Femz');
  const [av, setAv] = useState<string | null>(saved.current?.av || null);
  /* confidentialité (opt-in globe + DM) — persistée via /api/consent quand session */
  const [visible, setVisible] = useState<boolean>(getMe()?.visible ?? false);
  const [dmsOpen, setDmsOpen] = useState<boolean>(getMe()?.dms_open ?? true);
  function toggleVisible() {
    const v = !visible;
    setVisible(v);
    void saveConsent(v, dmsOpen).catch(() => {});
  }
  function toggleDms() {
    const v = !dmsOpen;
    setDmsOpen(v);
    void saveConsent(visible, v).catch(() => {});
  }
  const [reels, setReels] = useState<ProfileReel[]>(() => {
    const r = saved.current?.reels || [];
    return [0, 1, 2].map((i) => r[i] || { url: '', thumb: '' });
  });

  /* ── messages : re-rendu quand le store change ── */
  useSyncExternalStore(NVDM.subscribe, NVDM.version);
  const convs = NVDM.convs();
  const unread = NVDM.unread() > 0;

  useImperativeHandle(ref, () => ({ openDms: () => setPanel('msgs') }));

  /* ── hauteur de la nav : GSAP, ease maison ── */
  useLayoutEffect(() => {
    const nav = navRef.current!;
    let h = 94;
    if (panel === 'menu') h = 94 + (contentRef.current?.scrollHeight || 0) + 2;
    if (panel === 'profile') h = 94 + (profileRef.current?.scrollHeight || 0) + 2;
    if (panel === 'msgs') h = 94 + (msgsRef.current?.scrollHeight || 0) + 2;
    if (Math.abs(nav.offsetHeight - h) < 1) return;
    gsap.to(nav, {
      height: h,
      duration: prefersReducedMotion() ? 0 : 0.45,
      ease: nvEase,
      overwrite: 'auto',
    });
  });

  /* ── cascade des 3 cartes du menu (GSAP) ── */
  useLayoutEffect(() => {
    if (panel !== 'menu') return;
    const cards = contentRef.current?.querySelectorAll('.ncard');
    if (!cards?.length) return;
    if (prefersReducedMotion()) {
      gsap.set(cards, { y: 0, opacity: 1 });
      return;
    }
    gsap.fromTo(
      cards,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: nvEase, stagger: 0.08, delay: 0.06 },
    );
  }, [panel]);

  /* ── anneau de progression : se remplit ET passe gris→bleu (une fois) ── */
  useEffect(() => {
    if (panel !== 'profile' || ringDone.current) return;
    ringDone.current = true;
    const arc = arcRef.current!;
    const pct = pctRef.current!;
    const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
    if (prefersReducedMotion()) {
      arc.style.strokeDashoffset = String(RING_CIRC * (1 - RING_PROG));
      arc.style.stroke = '#5EA2FF';
      pct.textContent = `${Math.round(RING_PROG * 100)}%`;
      return;
    }
    const start = performance.now();
    const DUR = 1100;
    function step(now: number) {
      const k = Math.min(1, (now - start) / DUR);
      const e2 = 1 - Math.pow(1 - k, 3);
      const p = RING_PROG * e2;
      arc.style.strokeDashoffset = (RING_CIRC * (1 - p)).toFixed(2);
      arc.style.stroke = `rgb(${lerp(126, 94, p)},${lerp(132, 162, p)},${lerp(141, 255, p)})`;
      pct.textContent = `${Math.round(p * 100)}%`;
      if (k < 1) requestAnimationFrame(step);
      else arc.style.filter = 'drop-shadow(0 0 6px rgba(94,162,245,.5))';
    }
    requestAnimationFrame(step);
  }, [panel]);

  /* ── Échap + clic extérieur ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPanel(null);
    }
    function onClick(e: MouseEvent) {
      if (!(e.target as Element).closest?.('.cnav-wrap')) setPanel(null);
    }
    addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  /* ── helpers profil ── */
  function readAsData(file: File, cb: (d: string) => void) {
    const r = new FileReader();
    r.onload = () => cb(r.result as string);
    r.readAsDataURL(file);
  }
  function collect(): ProfileData {
    return {
      city: city.trim(),
      av,
      socials: { ig: ig.trim(), tt: tt.trim(), yt: yt.trim() },
      reels: reels.filter((r) => r.url.trim() || r.thumb),
    };
  }
  function save() {
    const d = collect();
    profileStore.save(d);
    saved.current = d;
    setSaveLabel('Enregistré ✓');
    setTimeout(() => {
      setSaveLabel('Enregistrer');
      setPanel(null);
    }, 900);
  }

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const navClass =
    'cnav' +
    (panel === 'menu' ? ' open' : '') +
    (panel === 'profile' ? ' profile' : '') +
    (panel === 'msgs' ? ' msgs' : '');

  /* avatar des conversations : la conv fondateur reprend la photo de profil */
  function dmAvatar(founder: boolean, name: string) {
    if (founder && av) return <span className="dm-av" style={{ backgroundImage: `url(${av})` }} />;
    return <span className="dm-av">{name.slice(0, 2).toUpperCase()}</span>;
  }

  const convIds = Object.keys(convs);

  return (
    <div className="cnav-wrap">
      <nav className={navClass} ref={navRef}>
        <div className="cnav-top">
          <button
            className="hamb"
            aria-label="Ouvrir le menu"
            aria-expanded={panel === 'menu'}
            onClick={() => toggle('menu')}
          >
            <i />
            <i />
          </button>
          <div className="cnav-brand">
            <a className="cnav-home" href="https://www.femzlab.shop" aria-label="Retour sur femzlab.shop">
              {/* logo alpha : HEVC (.mov) pour Safari, VP9 (.webm) pour le reste */}
              <video
                className="cnav-logovid"
                autoPlay
                muted
                loop
                playsInline
                aria-hidden="true"
                onLoadedMetadata={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
              >
                <source src="/espace/FemzLab-logo-safari.mov" type='video/mp4; codecs="hvc1"' />
                <source src="/espace/FemzLab-logo.webm" type="video/webm" />
              </video>
            </a>
            <div className="cnav-logo">
              NÉO<em>VISION</em>
            </div>
          </div>
          <div className="cnav-right">
            <button
              className={'msg-btn' + (unread ? ' unread' : '')}
              id="msgBtn"
              aria-expanded={panel === 'msgs'}
              aria-controls="cnavMsgs"
              aria-label="Messages"
              onClick={() => toggle('msgs')}
            >
              <MessageBubble />
              <span className="msg-dot" />
            </button>
            <button
              className="me-btn"
              aria-expanded={panel === 'profile'}
              aria-controls="cnavProfile"
              onClick={() => toggle('profile')}
            >
              <span className="me-av" id="meAv" style={av ? { backgroundImage: `url(${av})` } : undefined}>
                {av ? '' : 'FZ'}
              </span>
              <span className="me-label">Mon espace</span>
            </button>
          </div>
        </div>

        {/* ── panneau profil ── */}
        <div className="cnav-profile" id="cnavProfile" ref={profileRef} aria-hidden={panel !== 'profile'}>
          <div className="pf-head">
            <label
              className="pf-av"
              title="Changer la photo de profil"
              style={av ? { backgroundImage: `url(${av})` } : undefined}
            >
              {av ? '' : 'FZ'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readAsData(f, setAv);
                }}
              />
              <span className="pf-av-edit">
                <Pencil />
              </span>
            </label>
            <div>
              <b>Femz</b>
              <span>@imfemz · Pack Créateur</span>
            </div>
          </div>
          <div className="pf-grid">
            <div className="pf-left">
              <svg className="pf-ring" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Progression de la formation">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#22262C" strokeWidth="7" />
                <circle
                  ref={arcRef}
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="#7E848D"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={RING_CIRC}
                  transform="rotate(-90 60 60)"
                />
                <text
                  ref={pctRef}
                  x="60"
                  y="66"
                  textAnchor="middle"
                  fontSize="22"
                  fontWeight="700"
                  fill="#EDEFF2"
                  fontFamily="Instrument Sans,sans-serif"
                >
                  0%
                </text>
              </svg>
              <p className="pf-stats">
                15/40 épisodes vus
                <br />1 reel produit
              </p>
            </div>
            <div className="pf-right">
              <label>
                Ville <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
              <label>
                Instagram <input type="text" value={ig} onChange={(e) => setIg(e.target.value)} />
              </label>
              <label>
                TikTok <input type="text" placeholder="@pseudo" value={tt} onChange={(e) => setTt(e.target.value)} />
              </label>
              <label>
                YouTube <input type="text" value={yt} onChange={(e) => setYt(e.target.value)} />
              </label>
            </div>
          </div>
          <div className="pf-reels">
            <span className="pf-sub">
              Mes 3 reels <em>— ils s'affichent sur ta carte du globe</em>
            </span>
            {reels.map((r, i) => (
              <div className="pf-reel" key={i}>
                <label
                  className={'pf-thumb' + (r.thumb ? ' filled' : '')}
                  style={r.thumb ? { backgroundImage: `url(${r.thumb})` } : undefined}
                >
                  <input
                    type="file"
                    accept="image/*,video/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.type.startsWith('image')) {
                        readAsData(f, (d) =>
                          setReels((rs) => rs.map((x, j) => (j === i ? { ...x, thumb: d } : x))),
                        );
                      }
                    }}
                  />
                  +
                </label>
                <input
                  type="url"
                  placeholder={i === 0 ? 'Lien du reel 1 (Instagram / TikTok)' : `Lien du reel ${i + 1}`}
                  value={r.url}
                  onChange={(e) =>
                    setReels((rs) => rs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                  }
                />
              </div>
            ))}
          </div>
          <div className="pf-privacy">
            <span className="pf-sub">Confidentialité</span>
            <button className="pf-tgrow" type="button" onClick={toggleVisible}>
              <span>Apparaître sur le globe</span>
              <span className={'tg' + (visible ? ' on' : '')} aria-hidden="true">
                <i />
              </span>
            </button>
            <button className="pf-tgrow" type="button" onClick={toggleDms}>
              <span>Recevoir des messages</span>
              <span className={'tg' + (dmsOpen ? ' on' : '')} aria-hidden="true">
                <i />
              </span>
            </button>
          </div>
          <button className="btn btn-acc pf-save" onClick={save}>
            {saveLabel}
          </button>
        </div>

        {/* ── liste des messages ── */}
        <div className="cnav-msgs" id="cnavMsgs" ref={msgsRef} aria-hidden={panel !== 'msgs'}>
          <p className="dm-title">Messages</p>
          {convIds.length === 0 && (
            <p className="dm-title dm-empty">Aucune conversation — clique un créateur sur le globe.</p>
          )}
          {convIds.map((id) => {
            const c = convs[id];
            const last = c.msgs[c.msgs.length - 1];
            return (
              <button
                key={id}
                className="dm-item"
                onClick={() => {
                  setPanel(null);
                  onOpenConv(id);
                }}
              >
                {dmAvatar(c.founder, c.name)}
                <div>
                  <b>{c.name}</b>
                  <span>{last ? (last.f === 'me' ? 'Toi : ' : '') + last.x : ''}</span>
                </div>
                {c.unread > 0 && <span className="du" />}
              </button>
            );
          })}
        </div>

        {/* ── menu : 3 cartes ── */}
        <div className="cnav-content" id="cnavContent" ref={contentRef} aria-hidden={panel !== 'menu'}>
          <div className="ncard ncard-1">
            <div className="ncard-label">Formation</div>
            <div className="ncard-links">
              <a href="#modules" onClick={() => setPanel(null)}>
                <b>↗</b> Les modules
              </a>
              <a href="#" onClick={() => setPanel(null)}>
                <b>↗</b> Reprendre · 3.2
              </a>
              <a href="#packs" onClick={() => setPanel(null)}>
                <b>↗</b> Mes ressources
              </a>
            </div>
          </div>
          <div className="ncard ncard-2">
            <div className="ncard-label">Communauté</div>
            <div className="ncard-links">
              <a href="#globe" onClick={() => setPanel(null)}>
                <b>↗</b> Le globe
              </a>
              <a href="#" onClick={() => setPanel(null)}>
                <b>↗</b> Discord
              </a>
              <a href="#reels" onClick={() => setPanel(null)}>
                <b>↗</b> Les reels des élèves
              </a>
            </div>
          </div>
          <div className="ncard ncard-3">
            <div className="ncard-label">Mon compte</div>
            <div className="ncard-links">
              <a href="#" onClick={() => setPanel(null)}>
                <b>↗</b> Ma progression
              </a>
              <a href="#" onClick={() => setPanel(null)}>
                <b>↗</b> Mon pack · Créateur
              </a>
              <a href="#" onClick={() => setPanel(null)}>
                <b>↗</b> Support
              </a>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
});

export default CardNav;
