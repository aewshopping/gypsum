const { defineConfig } = require('@playwright/test');

const baseURL = process.env.CODESPACE_NAME
  ? `https://${process.env.CODESPACE_NAME}-8000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
  : 'http://localhost:8000';

module.exports = defineConfig({
  testDir: './tests',
  // Spread tests within a file across workers too, not just whole files. Without this a
  // single long spec (13-autosave) pins one worker and sets the floor for the whole run.
  fullyParallel: true,
  // The tests spend most of their time waiting on page loads and view transitions rather
  // than on CPU, so running more of them than there are cores still pays off.
  workers: 8,
  use: {
    baseURL,
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
