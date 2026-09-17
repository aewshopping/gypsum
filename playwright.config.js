const { defineConfig } = require('@playwright/test');

const baseURL = process.env.CODESPACE_NAME
  ? `https://${process.env.CODESPACE_NAME}-8000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
  : 'http://localhost:8000';

module.exports = defineConfig({
  testDir: './tests',
  // Spread tests within a file across workers too, not just whole files. Without this a
  // single long spec (13-autosave) pins one worker and sets the floor for the whole run.
  fullyParallel: true,
  // More workers than cores, because a test spends much of its life waiting on a page load
  // rather than on CPU. Measured on a four-core machine at the suite's current size: 4 workers
  // 69s, 8 workers 52s, 12 workers 45s on the same spec, with 16 no better than 12.
  workers: 12,
  use: {
    baseURL,
    // Every test gets a fresh context, and in each one the page registered the service worker and
    // let it cache the whole app — a hundred-odd files — for tests that never go offline.
    // tests/pwa.spec.js, which is about the worker, allows it again for itself.
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'python -m http.server 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        headless: true,
        launchOptions: {
          args: process.env.CODESPACE_NAME ? ['--no-sandbox'] : [],
        },
      },
    },
  ],
});
