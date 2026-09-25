import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { NVDM } from '../lib/dm';
import { profileStore } from '../lib/profile';
import { prefersReducedMotion } from '../lib/motion';
import { MessageBubble } from './Icons';
import { getMe } from '../lib/api';
import ProfilePanel from './ProfilePanel';

gsap.registerPlugin(CustomEase);
const nvEase = CustomEase.create('nvNav', '0.22,1,0.36,1');
type Panel = 'menu' | 'profile' | 'msgs' | null;
export type CardNavHandle = { openDms: () => void };
type Props = { onOpenConv: (id: string) => void };

const CardNav = forwardRef<CardNavHandle, Props>(function CardNav({ onOpenConv }, ref) {
  const navRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [av, setAv] = useState<string | null>(profileStore.load()?.av || getMe()?.avatar || null);
  useEffect(() => profileStore.subscribe((d) => setAv(d.av)), []);
  useSyncExternalStore(NVDM.subscribe, NVDM.version);
  const convs = NVDM.convs();
  const unread = NVDM.unread() > 0;
  const me = getMe();
  useImperativeHandle(ref, () => ({ openDms: () => setPanel('msgs') }));

  useLayoutEffect(() => {
    const nav = navRef.current!;
    /* hauteur de base = la rangée du haut (64px desktop, 56px mobile, cf. CSS) */
    const base = topRef.current?.offsetHeight || 64;
    const panneau = panel === 'menu' ? contentRef.current : panel === 'profile' ? profileRef.current : panel === 'msgs' ? msgsRef.current : null;
    let h = base;
    if (panneau) {
      /* la nav est fixed + overflow:hidden : si elle dépasse le bas de l'écran, le
         contenu est coupé et c'est la page derrière qui défile (bug mobile).
         On plafonne la card à l'écran et on laisse le panneau défiler dedans. */
      const dispo = Math.max(200, (visualViewport?.height || innerHeight) - nav.getBoundingClientRect().top - 14);
      const plein = base + panneau.scrollHeight + 2;
      h = Math.min(plein, dispo);
      if (plein > dispo) nav.style.setProperty('--cnav-panel-max', `${h - base}px`);
      else nav.style.removeProperty('--cnav-panel-max');
    } else {
      nav.style.removeProperty('--cnav-panel-max');
    }
    if (Math.abs(nav.offsetHeight - h) < 1) return;
    gsap.to(nav, { height: h, duration: prefersReducedMotion() ? 0 : 0.45, ease: nvEase, overwrite: 'auto' });
  });
  /* rotation / clavier virtuel / redimensionnement : la hauteur dispo change → on remesure */
  const [, remesure] = useState(0);
  useEffect(() => {
    const on = () => remesure((n) => n + 1);
    addEventListener('resize', on);
    addEventListener('orientationchange', on);
    visualViewport?.addEventListener('resize', on);
    return () => {
      removeEventListener('resize', on);
      removeEventListener('orientationchange', on);
      visualViewport?.removeEventListener('resize', on);
    };
  }, []);
  useLayoutEffect(() => {
    if (panel !== 'menu') return;
    const cards = contentRef.current?.querySelectorAll('.ncard');
    if (!cards?.length) return;
    if (prefersReducedMotion()) { gsap.set(cards, { y: 0, opacity: 1 }); return; }
    gsap.fromTo(cards, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: nvEase, stagger: 0.08, delay: 0.06 });
  }, [panel]);
  /* body.nav-open : les textes du globe s'effacent derrière le panneau (CSS) */
  useEffect(() => {
    document.body.classList.toggle('nav-open', panel !== null);
    return () => document.body.classList.remove('nav-open');
  }, [panel]);
  /* Panneau ouvert sur mobile : la page derrière est GELÉE (body figé à sa
     position de scroll), seul le panneau au premier plan défile. Sans ça, le
     doigt entraînait l'arrière-plan dès que le panneau touchait son butoir. */
  useEffect(() => {
    if (panel === null || !matchMedia('(max-width: 820px)').matches) return;
    const b = document.body, y = scrollY;
    const memo = { position: b.style.position, top: b.style.top, left: b.style.left, right: b.style.right, width: b.style.width };
    b.style.position = 'fixed'; b.style.top = `-${y}px`; b.style.left = '0'; b.style.right = '0'; b.style.width = '100%';
    return () => {
      b.style.position = memo.position; b.style.top = memo.top; b.style.left = memo.left; b.style.right = memo.right; b.style.width = memo.width;
      scrollTo(0, y);
    };
  }, [panel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanel(null); };
    const onClick = (e: MouseEvent) => { if (!(e.target as Element).closest?.('.cnav-wrap')) setPanel(null); };
    addEventListener('keydown', onKey); document.addEventListener('click', onClick);
    return () => { removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, []);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const navClass = 'cnav' + (panel === 'menu' ? ' open' : '') + (panel === 'profile' ? ' profile' : '') + (panel === 'msgs' ? ' msgs' : '');
  const initials = (me?.display_name || '?').slice(0, 2).toUpperCase();
  const convIds = Object.keys(convs);

  return (
    <div className="cnav-wrap">
      <nav className={navClass} ref={navRef}>
        <div className="cnav-top" ref={topRef}>
          <button className="hamb" aria-label="Ouvrir le menu" aria-expanded={panel === 'menu'} onClick={() => toggle('menu')}><i /><i /></button>
          {/* le logo FemzLab vit AU-DESSUS de la card (App) ; ici seulement le titre de la page */}
          <span className="cnav-title">Mon espace</span>
          <div className="cnav-right">
            {/* id="langslot" : i18n.js y docke le toggle FR/EN (flottant sinon) */}
            <span id="langslot" />
            {/* id="msgBtn" : cible de l'animation « génie » de fermeture de DmModal */}
            <button id="msgBtn" className={'msg-btn' + (unread ? ' unread' : '')} aria-expanded={panel === 'msgs'} aria-controls="cnavMsgs" aria-label="Messages" onClick={() => toggle('msgs')}>
              <MessageBubble /><span className="msg-dot" />
            </button>
            <button className="me-btn" aria-expanded={panel === 'profile'} aria-controls="cnavProfile" onClick={() => toggle('profile')}>
              <span className="me-av" style={av ? { backgroundImage: `url(${av})` } : undefined}>{av ? '' : initials}</span>
              <span className="me-label">Mon espace</span>
            </button>
          </div>
        </div>

        <div className="cnav-profile" id="cnavProfile" ref={profileRef} aria-hidden={panel !== 'profile'}>
          {panel === 'profile' && <ProfilePanel onClose={() => setPanel(null)} />}
        </div>

        <div className="cnav-msgs" id="cnavMsgs" ref={msgsRef} aria-hidden={panel !== 'msgs'}>
          <p className="dm-title">Messages</p>
          {convIds.length === 0 && <p className="dm-title dm-empty">Aucune conversation — clique un créateur sur le globe.</p>}
          {convIds.map((id) => {
            const c = convs[id]; const last = c.msgs[c.msgs.length - 1];
            return (
              <button key={id} className="dm-item" onClick={() => { setPanel(null); onOpenConv(id); }}>
                {c.avatar ? <span className="dm-av" style={{ backgroundImage: `url(${c.avatar})` }} /> : <span className="dm-av">{c.name.slice(0, 2).toUpperCase()}</span>}
                <div><b>{c.name}</b><span>{last ? (last.f === 'me' ? 'Toi : ' : '') + last.x : ''}</span></div>
                {c.unread > 0 && <span className="du" />}
              </button>
            );
          })}
        </div>

        <div className="cnav-content" id="cnavContent" ref={contentRef} aria-hidden={panel !== 'menu'}>
          <div className="ncard ncard-1">
            <div className="ncard-label">Communauté</div>
            <div className="ncard-links">
              <a href="#globe" onClick={() => setPanel(null)}><b>↗</b> Le globe</a>
              <a href="https://discord.gg/xmwq2NMDTw" target="_blank" rel="noopener"><b>↗</b> Discord</a>
            </div>
          </div>
          <div className="ncard ncard-2">
            <div className="ncard-label">Mon compte</div>
            <div className="ncard-links">
              <a href="#" onClick={(e) => { e.preventDefault(); setPanel('profile'); }}><b>↗</b> Mon profil</a>
              <a href="#" onClick={(e) => { e.preventDefault(); setPanel('profile'); }}><b>↗</b> Confidentialité</a>
            </div>
          </div>
          <div className="ncard ncard-3">
            <div className="ncard-label">FemzLab</div>
            <div className="ncard-links">
              <a href="https://www.femzlab.shop"><b>↗</b> La boutique</a>
              <a href="mailto:hello@imfemz.com"><b>↗</b> Support</a>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
});
export default CardNav;
