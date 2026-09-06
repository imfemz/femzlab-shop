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
    let h = 94;
    if (panel === 'menu') h = 94 + (contentRef.current?.scrollHeight || 0) + 2;
    if (panel === 'profile') h = 94 + (profileRef.current?.scrollHeight || 0) + 2;
    if (panel === 'msgs') h = 94 + (msgsRef.current?.scrollHeight || 0) + 2;
    if (Math.abs(nav.offsetHeight - h) < 1) return;
    gsap.to(nav, { height: h, duration: prefersReducedMotion() ? 0 : 0.45, ease: nvEase, overwrite: 'auto' });
  });
  useLayoutEffect(() => {
    if (panel !== 'menu') return;
    const cards = contentRef.current?.querySelectorAll('.ncard');
    if (!cards?.length) return;
    if (prefersReducedMotion()) { gsap.set(cards, { y: 0, opacity: 1 }); return; }
    gsap.fromTo(cards, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: nvEase, stagger: 0.08, delay: 0.06 });
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
        <div className="cnav-top">
          <button className="hamb" aria-label="Ouvrir le menu" aria-expanded={panel === 'menu'} onClick={() => toggle('menu')}><i /><i /></button>
          <div className="cnav-brand">
            <a className="cnav-home" href="https://www.femzlab.shop" aria-label="Retour sur femzlab.shop">
              <video className="cnav-logovid" autoPlay muted loop playsInline aria-hidden="true" onLoadedMetadata={(e) => { e.currentTarget.play().catch(() => {}); }}>
                <source src="/espace/FemzLab-logo-safari.mov" type='video/mp4; codecs="hvc1"' />
                <source src="/espace/FemzLab-logo.webm" type="video/webm" />
              </video>
            </a>
            <div className="cnav-logo">MON <em>ESPACE</em></div>
          </div>
          <div className="cnav-right">
            <button className={'msg-btn' + (unread ? ' unread' : '')} aria-expanded={panel === 'msgs'} aria-controls="cnavMsgs" aria-label="Messages" onClick={() => toggle('msgs')}>
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
