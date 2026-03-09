/**
 * Standalone entry point to start the Fermenter web server.
 * Usage: bun run src/serve.ts
 */
import { createApp } from './server.js';

const port = parseInt(process.env.PORT || '3000', 10);
const app = createApp();

export default {
  port,
  fetch: app.fetch,
};

console.log(`Fermenter UI running at http://localhost:${port}`);
