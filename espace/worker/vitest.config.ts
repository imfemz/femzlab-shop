import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));
  return {
    test: {
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
            },
          },
        },
      },
    },
  };
});
