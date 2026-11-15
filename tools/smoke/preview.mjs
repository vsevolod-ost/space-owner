/**
 * `vite preview` for the smoke tools (tools/smoke.mjs, tools/smoke-all.mjs): serves the
 * production build (`dist/`, from `npm run build`) on a free local port.
 *
 *   const preview = await startPreview();   // { url, process }
 *   ...
 *   preview.process.kill();
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

/** Starts `vite preview` on a free port; resolves with its URL and its process (to kill). */
export async function startPreview() {
  const port = await freePort();
  const preview = spawn(
    process.execPath,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`vite preview did not start:\n${output}`)),
      20000,
    );
    const onData = (chunk) => {
      output += chunk;
      // Vite colours its output; strip ANSI codes before looking for the URL.
      const match = stripVTControlCharacters(output).match(/Local:\s+(http\S+)/);
      if (match) {
        clearTimeout(timer);
        resolveUrl(match[1]);
      }
    };
    preview.stdout.on('data', onData);
    preview.stderr.on('data', onData);
    preview.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`vite preview exited with code ${code}:\n${output}`));
    });
  });
  return { url, process: preview };
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}
