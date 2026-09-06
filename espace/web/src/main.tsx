import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initSession, hasSession } from './lib/api';
import { initProfileFromApi } from './lib/profile';
import { initDmsFromApi } from './lib/dm';
import { initCreatorsFromApi } from './lib/creators';

/**
 * Bootstrap : on détecte la session (cookie + /api/me) AVANT le premier rendu.
 * Session active → les stores s'hydratent depuis le backend (profil, DMs,
 * créateurs du globe). Sans session ou sans backend → mode démo localStorage,
 * strictement identique à la maquette.
 */
async function bootstrap() {
  await initSession();
  if (hasSession()) {
    const results = await Promise.allSettled([initProfileFromApi(), initDmsFromApi(), initCreatorsFromApi()]);
    for (const r of results) {
      if (r.status === 'rejected') console.warn('Hydratation API partielle :', r.reason);
    }
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
