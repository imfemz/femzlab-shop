export type EmailSendBinding = { send(msg: { from: { email: string; name?: string }; to: string; subject: string; html: string; text?: string; replyTo?: string }): Promise<void> };

export type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  APP_URL: string;
  ENV: string;
  OWNER_EMAILS: string;
  EMAIL: EmailSendBinding;
  EXPEDITEUR: string;
};

/**
 * Liste blanche des environnements « de développement ».
 * Volontairement positive : si `ENV` est absent ou inconnu, on est en mode
 * verrouillé (route dev fermée, cookies `Secure`) plutôt qu'ouvert.
 */
export const isDevLike = (env: Pick<Env, 'ENV'>) => env.ENV === 'development' || env.ENV === 'test';

export type User = {
  id: number; created_at: string; display_name: string | null; name: string | null;
  avatar_key: string | null; country: string | null; city: string | null;
  lat: number | null; lon: number | null; socials: string | null; reels: string | null;
  lang: string | null; founder: number; visible: number; dms_open: number;
  consented_at: string | null; revoked: number; deleted_at: string | null;
};
export type Vars = { user: User };
