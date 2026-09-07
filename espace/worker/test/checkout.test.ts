import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { app } from '../src/index';
import { mkUser, cookieFor } from './helpers';

const post = (body: unknown) => app.request('/espace/hooks/checkout', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) }, env);

describe('hook de checkout', () => {
  it('enregistre un achat non rattaché déduit du slug de la page', async () => {
    const r = await post({ email: 'Client@Exemple.com', podia_id: 'pd_1', page: '/vortex-pack/thanks' });
    expect(r.status).toBe(200);
    const row = await env.DB.prepare("SELECT email, product, source, external_ref, user_id FROM purchases WHERE external_ref = 'pd_1'").first<any>();
    expect(row).toMatchObject({ email: 'client@exemple.com', product: 'Vortex Sound Pack', source: 'checkout', user_id: null });
  });

  it('rattache immédiatement si le membre est déjà connu', async () => {
    const u = await mkUser({ display_name: 'V' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('v@e.co', ?, 'oauth')").bind(u).run();
    await post({ email: 'v@e.co', podia_id: 'pd_2', page: '/motionlab/thanks' });
    const row = await env.DB.prepare("SELECT user_id FROM purchases WHERE external_ref = 'pd_2'").first<any>();
    expect(row.user_id).toBe(u);
  });

  it('rejouer le même événement (même email, même produit) n\'insère rien de plus', async () => {
    const ev = { email: 'rejeu@e.co', podia_id: 'pd_9', page: '/metavision/thanks' };
    expect((await post(ev)).status).toBe(200);
    expect((await post(ev)).status).toBe(200);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM purchases WHERE email = 'rejeu@e.co' AND product = 'MetaVision'").first<any>();
    expect(n.n).toBe(1);
  });

  it('ignore silencieusement un corps invalide, un produit inconnu, ou un corps trop lourd — jamais d\'erreur visible', async () => {
    // Storage D1 isolé par test (isolatedStorage, défaut de @cloudflare/vitest-pool-workers) :
    // contrairement aux deux `it` précédents, ce test part d'une table `purchases` vide. On
    // insère donc ici les deux achats valides de référence avant de vérifier que les corps
    // invalides n'en ajoutent aucun (cf. task-3-report.md, écart signalé au brief).
    await post({ email: 'a@b.co', podia_id: 'pd_3', page: '/motionlab/thanks' });
    await post({ email: 'c@d.co', podia_id: 'pd_4', page: '/motionlab/thanks' });
    expect((await app.request('/espace/hooks/checkout', { method: 'POST', body: 'pas du json' }, env)).status).toBe(200);
    expect((await post({ email: 'x@y.co', page: '/produit-inexistant/thanks' })).status).toBe(200);
    expect((await post({ page: '/motionlab/thanks' })).status).toBe(200); // email absent
    const gros = 'a'.repeat(9000);
    expect((await app.request('/espace/hooks/checkout', { method: 'POST', body: gros }, env)).status).toBe(200);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first<any>();
    expect(n.n).toBe(2); // seuls les deux achats valides insérés ci-dessus ; les corps invalides n'ajoutent rien
  });
});
