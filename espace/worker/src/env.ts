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
  COOKIE_DOMAIN?: string;
};
export type User = {
  id: number; created_at: string; display_name: string | null; name: string | null;
  avatar_key: string | null; country: string | null; city: string | null;
  lat: number | null; lon: number | null; socials: string | null; reels: string | null;
  lang: string | null; founder: number; visible: number; dms_open: number;
  consented_at: string | null; revoked: number; deleted_at: string | null;
};
export type Vars = { user: User };
