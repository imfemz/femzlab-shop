import { applyD1Migrations, env } from 'cloudflare:test';
declare module 'cloudflare:test' {
  interface ProvidedEnv { TEST_MIGRATIONS: D1Migration[]; DB: D1Database; MEDIA: R2Bucket; JWT_SECRET: string; ENV: string; APP_URL: string; OWNER_EMAILS: string; ASSETS: Fetcher; GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; DISCORD_CLIENT_ID: string; DISCORD_CLIENT_SECRET: string; }
}
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
