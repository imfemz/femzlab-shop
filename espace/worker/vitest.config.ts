import path from 'node:path';
import { configDefaults } from 'vitest/config';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    test: {
      // test/e2e/*.spec.mjs est un script Playwright autonome (exécuté avec `node`,
      // pas par vitest) : il matche le glob de test par défaut (*.spec.*) mais
      // `import { chromium } from 'playwright'` plante dans le pool Workers
      // (process.exit appelé en portée globale, non supporté par workerd).
      exclude: [...configDefaults.exclude, 'test/e2e/**'],
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.jsonc' },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              JWT_SECRET: 'test-secret',
              ENV: 'test',
              GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret',
              DISCORD_CLIENT_ID: 'did', DISCORD_CLIENT_SECRET: 'dsecret',
              APP_URL: 'http://localhost/espace',
              OWNER_EMAILS: 'fraps81@gmail.com,hello@imfemz.com',
              EXPEDITEUR: 'espace@femzlab.shop',
            },
          },
        },
      },
    },
  };
});
