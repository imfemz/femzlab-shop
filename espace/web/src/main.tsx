import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initSession } from './lib/api';
import { initProfileFromApi } from './lib/profile';
import { initDmsFromApi } from './lib/dm';
import { initCreatorsFromApi } from './lib/creators';

/** Session résolue AVANT le premier rendu ; connecté → les stores s'hydratent depuis l'API. Pas de repli local. */
async function bootstrap() {
  const state = await initSession();
  if (state === 'auth') {
    const results = await Promise.allSettled([initProfileFromApi(), initDmsFromApi(), initCreatorsFromApi()]);
    for (const r of results) if (r.status === 'rejected') console.warn('Hydratation API partielle :', r.reason);
  }
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}
void bootstrap();
