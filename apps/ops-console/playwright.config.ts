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
  ],
});
