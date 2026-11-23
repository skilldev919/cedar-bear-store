'use strict';
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
const app = createApp({
  adminPassword: process.env.ADMIN_PASSWORD || undefined,
  secureCookies: process.env.SECURE_COOKIES === '1',
  sessionSecret: process.env.SESSION_SECRET || undefined,
});

app.server.listen(port, host, () => {
  console.log(`\n  Cedar Bear storefront (Phase 1 demo) running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log(`  Admin: http://localhost:${port}/admin`);
  if (app.auth.generatedPassword) {
    console.log(`  Generated admin password: ${app.auth.generatedPassword}  (also saved in data/runtime/INITIAL_ADMIN_PASSWORD.txt)`);
  } else if (!process.env.ADMIN_PASSWORD) {
    console.log('  Admin password: see data/runtime/INITIAL_ADMIN_PASSWORD.txt (or set ADMIN_PASSWORD).');
  }
  console.log('');
});
