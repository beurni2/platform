import { defineConfig, devices } from '@playwright/test';

/**
 * Ops-console Playwright harness (WO-OPS-0). Chromium is preinstalled in this
 * environment (PLAYWRIGHT_BROWSERS_PATH); PW_EXECUTABLE overrides the browser
 * binary when the pinned @playwright/test build differs from the preinstalled
 * one.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4273',
    ...(process.env.PW_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PW_EXECUTABLE } }
      : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // --host 127.0.0.1: vite preview binds `localhost` by default, which on
      // GitHub runners resolves to ::1 only — the 127.0.0.1 probe then times out.
      command: 'pnpm preview --host 127.0.0.1',
      url: 'http://127.0.0.1:4273',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // PROFIL-PUBLIÉ — the console as the deploy builds it (VITE_PROFILE
      // 'production', no protection base), in its own folder, for
      // e2e/profil-publie.spec.ts. The build above stays the preview.
      command:
        'pnpm exec vite build --outDir dist-publie --emptyOutDir && pnpm exec vite preview --outDir dist-publie --port 4274 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4274',
      env: { VITE_PROFILE: 'production', VITE_PROTECTION_BASE: '' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // The fund desk walk (e2e/fonds-live.spec.ts): the REAL protection
      // service bundle on workerd, in memory, 127.0.0.1 only, with a test key.
      // Needs `pnpm build` first, as CI runs it.
      command: 'node ../../services/protection-service/test/serve-for-console-walk.mjs',
      url: 'http://127.0.0.1:4276/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The console built LIVE against that service: the base URL only, never
      // a key — the walk types the key into the door, as the founder does.
      command:
        'pnpm exec vite build --outDir dist-fonds-live --emptyOutDir && pnpm exec vite preview --outDir dist-fonds-live --port 4275 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4275',
      env: { VITE_PROTECTION_BASE: 'http://127.0.0.1:4276' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
