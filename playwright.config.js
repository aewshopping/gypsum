const { defineConfig } = require('@playwright/test');

const baseURL = process.env.CODESPACE_NAME
  ? `https://${process.env.CODESPACE_NAME}-8000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
  : 'http://localhost:8000';

module.exports = defineConfig({
  testDir: './tests',
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
