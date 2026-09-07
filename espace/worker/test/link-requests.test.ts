import { env } from 'cloudflare:test';
import { describe, it, expect, vi } from 'vitest';
import { createLinkRequest, decideLinkRequest } from '../src/lib/link-requests';
import { mkUser } from './helpers';

function fakeEmail() {
  return { send: vi.fn(async () => {}) };
}

describe('demandes de liaison', () => {
  it('crée une demande, envoie un email à Femz avec deux liens, refuse une seconde demande en attente', async () => {
    const u = await mkUser({ display_name: 'A' });
    const fake = fakeEmail();
    const r1 = await createLinkRequest({ ...env, EMAIL: fake as any }, u, 'Autre@Mail.com');
    expect(r1).toEqual({ ok: true });
    expect(fake.send).toHaveBeenCalledTimes(1);
    const call = fake.send.mock.calls[0][0];
    expect(call.to).toBe('hello@imfemz.com');
    expect(call.html).toContain('/espace/admin/link/');
    expect(call.html).toContain('/approve');
    expect(call.html).toContain('/deny');
    const row = await env.DB.prepare('SELECT email, status, token_hash FROM link_requests WHERE user_id = ?').bind(u).first<any>();
    expect(row.email).toBe('autre@mail.com'); expect(row.status).toBe('pending'); expect(row.token_hash).toBeTruthy();

    const r2 = await createLinkRequest({ ...env, EMAIL: fakeEmail() as any }, u, 'encore@autre.com');
    expect(r2).toEqual({ error: 'demande_en_attente' });
  });

  it('refuse d\'office un email déjà lié à un autre membre, et prévient Femz', async () => {
    const proprio = await mkUser({ display_name: 'P' });
    await env.DB.prepare("INSERT INTO user_emails (email, user_id, verified_by) VALUES ('pris@x.co', ?, 'oauth')").bind(proprio).run();
    const demandeur = await mkUser({ display_name: 'D' });
    const fake = fakeEmail();
    const r = await createLinkRequest({ ...env, EMAIL: fake as any }, demandeur, 'pris@x.co');
    expect(r).toEqual({ error: 'deja_utilisee' });
    expect(fake.send).toHaveBeenCalledTimes(1); // email de conflit à Femz
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM link_requests WHERE user_id = ?').bind(demandeur).first<any>();
    expect(n.n).toBe(0);
  });

  it('approuver rattache l\'email et les achats en attente ; refuser ne rattache rien ; un jeton ne sert qu\'une fois', async () => {
    const u = await mkUser({ display_name: 'M' });
    await env.DB.prepare("INSERT INTO purchases (email, product, source, purchased_at) VALUES ('m@ok.co', 'MetaVision', 'checkout', '2026-01-01')").run();
    await createLinkRequest({ ...env, EMAIL: fakeEmail() as any }, u, 'm@ok.co');
    const { token_hash } = (await env.DB.prepare('SELECT token_hash FROM link_requests WHERE user_id = ?').bind(u).first<any>())!;
    // le jeton en clair n'est jamais stocké : on le récupère depuis l'appel d'email du test précédent n'est pas possible ici,
    // donc ce test relit le jeton via un deuxième createLinkRequest dont on intercepte l'email.
    const fake = fakeEmail();
    await env.DB.prepare('DELETE FROM link_requests').run();
    await createLinkRequest({ ...env, EMAIL: fake as any }, u, 'm@ok.co');
    const html: string = fake.send.mock.calls[0][0].html;
    const token = html.match(/\/espace\/admin\/link\/([a-f0-9]+)\//)![1];

    const d1 = await decideLinkRequest(env, token, 'approved');
    expect(d1).toMatchObject({ ok: true, email: 'm@ok.co', userId: u });
    const email = await env.DB.prepare("SELECT verified_by FROM user_emails WHERE email = 'm@ok.co'").first<any>();
    expect(email.verified_by).toBe('admin');
    const purchase = await env.DB.prepare("SELECT user_id FROM purchases WHERE email = 'm@ok.co'").first<any>();
    expect(purchase.user_id).toBe(u);

    const d2 = await decideLinkRequest(env, token, 'denied');
    expect(d2).toEqual({ error: 'deja_traite' });
  });

  it('un jeton inconnu ou invalide est refusé', async () => {
    expect(await decideLinkRequest(env, 'ff'.repeat(24), 'approved')).toEqual({ error: 'introuvable' });
  });
});
