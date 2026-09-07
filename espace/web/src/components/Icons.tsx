/**
 * Icônes SVG inline minimalistes — stroke 1.7-1.9, currentColor.
 * JAMAIS d'emoji dans l'UI (DA validée).
 */

export function ChevronDown({ w = 12, h = 8 }: { w?: number; h?: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 12 8" fill="none" aria-hidden="true">
      <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

export function ChevronDownAcc() {
  /* chevron des items d'accordéon (classe dédiée pour la rotation) */
  return (
    <svg className="acc-chev" width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
      <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

export function ArrowLeft() {
  return (
    <svg width="9" height="16" viewBox="0 0 11 20" fill="none" aria-hidden="true">
      <path d="M9.7 2 1.7 10l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

export function ArrowRight() {
  return (
    <svg width="9" height="16" viewBox="0 0 11 20" fill="none" aria-hidden="true">
      <path d="M1.3 18l8-8-8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

export function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function CloseX() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function MessageBubble() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M21 11.5c0 4.1-4 7.5-9 7.5-1.1 0-2.2-.16-3.2-.46L4 20l1.2-3.6C4 15.1 3 13.4 3 11.5 3 7.4 7 4 12 4s9 3.4 9 7.5Z" />
    </svg>
  );
}

export function SendPlane() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
    </svg>
  );
}

export function Pencil({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    </svg>
  );
}

export function Lock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" style={{ verticalAlign: '-1.5px' }} aria-hidden="true">
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="1.8" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

export function Gift() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ verticalAlign: '-2px' }} aria-hidden="true">
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M12 9v11M4 13.5h16M12 9c-4.5 0-5.5-5-2.4-5C11.4 4 12 6.5 12 9Zm0 0c4.5 0 5.5-5 2.4-5C12.6 4 12 6.5 12 9Z" />
    </svg>
  );
}

export function Pin() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" style={{ verticalAlign: '-1.5px' }} aria-hidden="true">
      <path d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 0 1 13 0c0 4.6-6.5 10-6.5 10Z" />
      <circle cx="12" cy="10.6" r="2.2" />
    </svg>
  );
}

export function FounderStar() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="#5EA2FF" style={{ verticalAlign: '-1px' }} aria-hidden="true">
      <path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 5.9L12 16.4l-5.3 2.9 1.2-5.9L3.4 9.3l6-.7L12 3Z" />
    </svg>
  );
}

/* Statuts d'épisodes (liste des modules) — SVG, pas de caractères ambigus */
export function StatusDone() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}
export function StatusCurrent() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 3.8v16.4c0 .9 1 1.4 1.7.9l12.1-8.2c.7-.4.7-1.4 0-1.8L7.7 2.9C7 2.4 6 2.9 6 3.8Z" />
    </svg>
  );
}
export function StatusTodo() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
