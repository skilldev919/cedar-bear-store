'use strict';
// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
// Static files (public/) are served by Vercel's CDN.
const { createApp } = require('../server/app');

const app = createApp({
  adminPassword: process.env.ADMIN_PASSWORD || undefined,
  sessionSecret: process.env.SESSION_SECRET || undefined,
  secureCookies: true,
});

module.exports = (req, res) => {
  // Restore the original path if the platform rewrote it to the function's own URL.
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('__path');
  if (original) {
    url.searchParams.delete('__path');
    const qs = url.searchParams.toString();
    req.url = `${original}${qs ? `?${qs}` : ''}`;
  }
  return app.handler(req, res);
};
