import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ChevronDownAcc, Gift, StatusCurrent, StatusDone, StatusTodo } from './Icons';

type EpState = 'ok' | 'cur' | 'td';
type Mod = {
  code: ReactNode;
  ttl: string;
  st: 'done' | 'now' | 'todo';
  bonus?: boolean;
  eps: [string, string, EpState][];
};

/* Contenu produit FIGÉ (source : PLAN-COURS.md) — ne jamais inventer */
const DATA: Mod[] = [
  { code: 'M0', ttl: 'Le déclic', st: 'done', eps: [['0.1', 'Le VFX IA en 2026', 'ok'], ['0.2', 'Anatomie d’un Reel viral', 'ok'], ['0.3', 'Monte ton studio IA', 'ok'], ['0.4', 'Ton tout premier plan IA', 'ok']] },
  { code: 'M1', ttl: 'L’image qui a l’air cinéma', st: 'done', eps: [['1.1', 'Les 4 signaux qui trahissent l’IA', 'ok'], ['1.2', 'Le framework de prompt image', 'ok'], ['1.3', 'Générer ses images dans ChatGPT', 'ok'], ['1.4', 'La consistance du personnage', 'ok']] },
  { code: 'M2', ttl: 'Prompt Mastery', st: 'done', eps: [['2.1', 'L’anatomie d’un prompt qui marche', 'ok'], ['2.2', 'Corriger un prompt raté', 'ok'], ['2.3', 'Le prompt pensé pour l’engagement', 'ok'], ['2.4', 'Ta bibliothèque de prompts', 'ok']] },
  { code: 'M3', ttl: 'Donner vie — image → vidéo', st: 'now', eps: [['3.1', 'Le principe image-to-video', 'ok'], ['3.2', 'Contrôler le mouvement et la caméra', 'cur'], ['3.3', 'Seedance, Gemini, Kling : lequel quand', 'td'], ['3.4', 'Gérer les échecs', 'td']] },
  { code: 'M4', ttl: 'Les effets signature', st: 'todo', eps: [['4.1', 'Effet : transformation / morph', 'td'], ['4.2', 'Effet : caméra impossible', 'td'], ['4.3', 'Effet : apparition / duplication', 'td'], ['4.4', 'Effet : changement de monde', 'td']] },
  { code: 'M5', ttl: 'Assembler sans After Effects', st: 'todo', eps: [['5.1', 'Enchaîner les plans avec du rythme', 'td'], ['5.2', 'Le sound design qui vend l’illusion', 'td'], ['5.3', 'Upscale & finition', 'td'], ['5.4', 'Export 9:16 propre', 'td']] },
  { code: 'M6', ttl: 'Idées & Script', st: 'todo', eps: [['6.1', 'Trouver des idées qui ne sèchent jamais', 'td'], ['6.2', 'Valider une idée avant de produire', 'td'], ['6.3', 'Écrire le script d’un Reel VFX', 'td'], ['6.4', 'Du script au plan de production', 'td']] },
  { code: 'M7', ttl: 'Rendre viral', st: 'todo', eps: [['7.1', 'Le hook en 2 secondes', 'td'], ['7.2', 'Structure de rétention', 'td'], ['7.3', 'Les leviers d’engagement', 'td'], ['7.4', 'Emballage : titre, caption, CTA', 'td']] },
  { code: 'M8', ttl: 'Ton système de production', st: 'todo', eps: [['8.1', 'Le workflow répétable', 'td'], ['8.2', 'Batcher sa production', 'td'], ['8.3', 'Ta bibliothèque perso', 'td'], ['8.4', 'Éthique & limites', 'td']] },
  {
    code: (
      <>
        <Gift /> BONUS
      </>
    ),
    ttl: 'Bonus — After Effects',
    st: 'todo',
    bonus: true,
    eps: [['B.1', 'AE en 20 min + casser le « AI look »', 'td'], ['B.2', 'Intégrer un plan IA dans une vraie vidéo', 'td'], ['B.3', 'Le motion tracking', 'td'], ['B.4', 'Le match final (grade, grain)', 'td']],
  },
];

const CHIP = {
  done: <span className="chip done">✓ Terminé</span>,
  now: <span className="chip now">En cours</span>,
  todo: <span className="chip todo">À venir</span>,
};
const ICON: Record<EpState, ReactNode> = {
  ok: <StatusDone />,
  cur: <StatusCurrent />,
  td: <StatusTodo />,
};

/**
 * Modules — bulle-barre glass unique qui déploie l'accordéon en cascade
 * (délais 45 ms via --i/--d en CSS). Liste plafonnée à 62vh qui défile
 * SOUS la barre avec fondu haut/bas (mask), scrollbar cachée.
 */
export default function Modules() {
  const [secOpen, setSecOpen] = useState(false);
  const [openItem, setOpenItem] = useState<number | null>(3); /* M3 ouvert par défaut */
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRefs = useRef<(HTMLDivElement | null)[]>([]);

  function setBodyHeights(next: number | null) {
    bodyRefs.current.forEach((b, i) => {
      if (b) b.style.height = next === i ? `${b.scrollHeight}px` : '0px';
    });
  }

  function toggleItem(i: number) {
    const next = openItem === i ? null : i;
    setOpenItem(next);
    setBodyHeights(next);
  }

  function wrapOpen() {
    const wrap = wrapRef.current!;
    setSecOpen(true);
    setBodyHeights(openItem); /* hauteurs initiales des corps */
    const maxH = Math.round(innerHeight * 0.62);
    const full = wrap.scrollHeight;
    const target = Math.min(full, maxH);
    wrap.style.height = `${target}px`;
    const fin = (e: TransitionEvent) => {
      if (e.target === wrap) {
        if (full > maxH) wrap.classList.add('scroll');
        else wrap.style.height = 'auto';
      }
      wrap.removeEventListener('transitionend', fin);
    };
    wrap.addEventListener('transitionend', fin);
  }
  function wrapClose() {
    const wrap = wrapRef.current!;
    setSecOpen(false);
    wrap.classList.remove('scroll');
    wrap.style.height = `${wrap.offsetHeight}px`;
    void wrap.offsetHeight;
    wrap.style.height = '0px';
  }

  return (
    <section id="modules" className={secOpen ? 'open' : ''}>
      <button
        className="mods-bar glow"
        aria-expanded={secOpen}
        aria-controls="modsWrap"
        onClick={() => (secOpen ? wrapClose() : wrapOpen())}
      >
        <span className="mb-ttl">Les modules</span>
        <span className="mb-prog">
          <span className="bar">
            <i />
          </span>{' '}
          3/10
        </span>
        <span className="mb-meta">9 modules + bonus · 40 épisodes</span>
        <span className="mb-chev">
          <ChevronDown w={14} h={9} />
        </span>
      </button>
      <div className="mods-wrap" id="modsWrap" ref={wrapRef}>
        <div className="acc">
          {DATA.map((mod, mi) => (
            <div
              key={mi}
              className={
                'acc-item glow' +
                (mod.st === 'now' ? ' now' : '') +
                (mod.bonus ? ' bonus' : '') +
                (openItem === mi ? ' open' : '')
              }
              style={{ '--i': mi } as CSSProperties}
            >
              <button className="acc-head" aria-expanded={openItem === mi} onClick={() => toggleItem(mi)}>
                <span className="code">{mod.code}</span>
                <span className="ttl">{mod.ttl}</span>
                {CHIP[mod.st]}
                <ChevronDownAcc />
              </button>
              <div
                className="acc-body"
                ref={(el) => {
                  bodyRefs.current[mi] = el;
                  /* hauteur initiale gérée impérativement (transitions px) */
                  if (el && el.style.height === '') el.style.height = '0px';
                }}
              >
                <ul className="acc-eps">
                  {mod.eps.map(([ec, ttl, st]) => (
                    <li key={ec} className={st === 'ok' ? 'ok' : st === 'cur' ? 'cur' : ''}>
                      <span className="st">{ICON[st]}</span>
                      <span className="ec">{ec}</span>
                      <span>{ttl}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
