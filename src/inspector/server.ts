/**
 * Pipeline Inspector Server
 *
 * Lightweight Bun.serve HTTP server that serves the inspector HTML page
 * and the latest pipeline snapshot JSON.
 *
 * Usage: bun run inspect
 */

import { resolve } from 'node:path';

const PORT = Number(process.env.INSPECT_PORT) || 3333;
const HOSTNAME = process.env.INSPECT_HOST || '127.0.0.1';
const OUTPUT_DIR = process.env.INSPECT_OUTPUT_DIR || 'output';
const HTML_PATH = resolve(import.meta.dir, 'index.html');
const SNAPSHOT_PATH = resolve(OUTPUT_DIR, 'pipeline-snapshot.json');

const server = Bun.serve({
  port: PORT,
  hostname: HOSTNAME,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve snapshot JSON
    if (url.pathname === '/api/snapshot') {
      const file = Bun.file(SNAPSHOT_PATH);
      if (await file.exists()) {
        return new Response(file, {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return Response.json(
        { error: 'No snapshot found. Run the pipeline with runtime.inspect: true first.' },
        { status: 404 },
      );
    }

    // Serve HTML page
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(Bun.file(HTML_PATH), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Pipeline Inspector running at http://${server.hostname}:${server.port}`);
