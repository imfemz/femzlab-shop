import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { NVDM } from '../lib/dm';
import { profileStore } from '../lib/profile';
import { BackArrow, CloseX, SendPlane } from './Icons';

type Props = {
  /** id de la conversation à afficher (null = fermée) */
  convId: string | null;
  /** fermée définitivement (✕, overlay, Échap) */
  onClosed: () => void;
  /** ← retour : fermée puis ré-ouverture de la liste dans la nav */
  onBackToList: () => void;
};

/**
 * Modale DM détachée : le site est flouté derrière, barre de saisie en bas.
 * ← revient à la liste (nav) ; ✕ / overlay / Échap ferment avec
 * l'animation « génie » : la fenêtre vole se ranger dans l'icône messages.
 */
export default function DmModal({ convId, onClosed, onBackToList }: Props) {
  const ovRef = useRef<HTMLDivElement>(null);
  const modRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closing = useRef(false);

  const [on, setOn] = useState(false);
  const [text, setText] = useState('');

  useSyncExternalStore(NVDM.subscribe, NVDM.version);
  const conv = convId ? NVDM.get(convId) : undefined;
  const av = profileStore.load()?.av || null;

  /* ouverture : marquer lu, apparaître, focus */
  useEffect(() => {
    if (!convId) return;
    closing.current = false;
    NVDM.read(convId);
    const mod = modRef.current!;
    mod.classList.remove('zap');
    mod.style.transform = '';
    /* la classe .on arrive après le premier paint pour déclencher la transition */
    const raf = requestAnimationFrame(() => setOn(true));
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [convId]);

  /* scroll en bas à chaque message */
  const msgCount = conv?.msgs.length ?? 0;
  useEffect(() => {
    const sc = scrollRef.current;
    if (sc) sc.scrollTop = sc.scrollHeight;
  }, [msgCount, convId]);

  function closeGenie() {
    if (closing.current || !convId) return;
    closing.current = true;
    const mod = modRef.current!;
    const btn = document.getElementById('msgBtn');
    if (btn) {
      const r = btn.getBoundingClientRect();
      const tx = r.left + r.width / 2 - innerWidth / 2;
      const ty = r.top + r.height / 2 - innerHeight / 2;
      mod.classList.add('zap');
      mod.style.transform = `translate(-50%,-50%) translate(${tx}px,${ty}px) scale(.04)`;
    }
    setOn(false);
    setTimeout(() => {
      mod.classList.remove('zap');
      mod.style.transform = '';
      onClosed();
    }, 520);
  }
  function closeToList() {
    if (closing.current || !convId) return;
    closing.current = true;
    setOn(false); /* retour doux */
    setTimeout(() => {
      onBackToList();
    }, 220);
  }

  /* Échap → fermeture génie */
  useEffect(() => {
    if (!convId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeGenie();
    }
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  function send() {
    const v = text.trim();
    if (!v || !convId) return;
    NVDM.send(convId, v);
    setText('');
  }

  return (
    <>
      <div
        ref={ovRef}
        className={'dmov' + (on && convId ? ' on' : '')}
        aria-hidden={!convId}
        onClick={closeGenie}
      />
      <div
        ref={modRef}
        className={'dmmod' + (on && convId ? ' on' : '')}
        role="dialog"
        aria-label="Conversation"
      >
        {conv && (
          <>
            <div className="dmm-head">
              <button className="dm-back" aria-label="Retour aux messages" onClick={closeToList}>
                <BackArrow />
              </button>
              {conv.founder && av ? (
                <span className="dm-av" style={{ backgroundImage: `url(${av})` }} />
              ) : (
                <span className="dm-av">{conv.name.slice(0, 2).toUpperCase()}</span>
              )}
              <b>{conv.name}</b>
              <button className="dmm-x" aria-label="Fermer" onClick={closeGenie}>
                <CloseX />
              </button>
            </div>
            <div className="dmm-msgs" ref={scrollRef}>
              {conv.msgs.map((m, i) => (
                <div key={i} className={'bub ' + (m.f === 'me' ? 'me' : 'them')}>
                  {m.x}
                  <time>{NVDM.fmt(m.t)}</time>
                </div>
              ))}
            </div>
            <div className="dmm-input">
              <input
                ref={inputRef}
                type="text"
                placeholder={`Écris à ${conv.name}…`}
                aria-label="Message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send();
                }}
              />
              <button className="dm-send" aria-label="Envoyer" onClick={send}>
                <SendPlane />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
