import type { Env } from '../env';

export type Provider = 'google' | 'discord';
export type OAuthProfile = {
  provider: Provider; providerId: string; email: string; emailVerified: boolean;
  name: string; avatarUrl: string | null;
};
export const PROVIDERS: Provider[] = ['google', 'discord'];

const CFG = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
  discord: {
    authorize: 'https://discord.com/oauth2/authorize',
    token: 'https://discord.com/api/oauth2/token',
    userinfo: 'https://discord.com/api/users/@me',
    scope: 'identify email',
  },
} as const;

function creds(p: Provider, env: Env) {
  return p === 'google'
    ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }
    : { id: env.DISCORD_CLIENT_ID, secret: env.DISCORD_CLIENT_SECRET };
}

export function authorizeUrl(p: Provider, env: Env, redirectUri: string, state: string): string {
  const u = new URL(CFG[p].authorize);
  u.searchParams.set('client_id', creds(p, env).id);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', CFG[p].scope);
  u.searchParams.set('state', state);
  if (p === 'google') u.searchParams.set('prompt', 'select_account');
  if (p === 'discord') u.searchParams.set('prompt', 'none');
  return u.toString();
}

/** Échange le code, lit le profil, le normalise. Lève en cas d'échec réseau ou de refus. */
export async function exchange(p: Provider, env: Env, redirectUri: string, code: string): Promise<OAuthProfile> {
  const { id, secret } = creds(p, env);
  const body = new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const tr = await fetch(CFG[p].token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!tr.ok) throw new Error(`token ${p} ${tr.status}`);
  const tok: any = await tr.json();
  const ur = await fetch(CFG[p].userinfo, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (!ur.ok) throw new Error(`userinfo ${p} ${ur.status}`);
  const u: any = await ur.json();
  if (p === 'google') {
    return { provider: p, providerId: String(u.sub), email: String(u.email || '').toLowerCase(), emailVerified: u.email_verified === true, name: String(u.name || ''), avatarUrl: u.picture || null };
  }
  return {
    provider: p, providerId: String(u.id), email: String(u.email || '').toLowerCase(), emailVerified: u.verified === true,
    name: String(u.global_name || u.username || ''),
    avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256` : null,
  };
}
