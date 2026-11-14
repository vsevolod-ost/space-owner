#!/usr/bin/env node
/**
 * Smoke test: serves the production build (`vite preview`), opens it in headless Chromium and
 * runs one scenario module against it. Fails (exit code 1) on any console error, page error,
 * failed request or scenario exception, and prints them.
 *
 * Usage:
 *   npm run smoke                                   # build, then the menu scenario
 *   node tools/smoke.mjs --scenario tools/smoke/scenarios/menu.mjs [--out smoke-out] [--timeout 180000]
 *                        [--viewport 1280x720] [--url http://127.0.0.1:5173/] [--headed]
 *
 * Needs a fresh `npm run build` (dist/). `--url` skips `vite preview` and uses a running server
 * (e.g. `npm run dev`). The browser is the system Chromium (CHROMIUM env var overrides the
 * path); playwright-core does not download browsers.
 *
 * A scenario exports `default async (page, h) => {}`; `page` is the Playwright page, `h` the
 * helpers below. Functions passed to `h.waitFor`, `h.holdUntil` and `h.eval` run inside the
 * page: they cannot see scenario variables, only `window` (`window.nasa.game`,
 * `window.nasa.services`). Pass values through the `arg` parameter of `h.eval`.
 *
 *   h.goto(path, { lang })             open a game URL; adds debug=1, and lang=en unless the path
 *                                      has its own lang or the call passes { lang: false } (then
 *                                      the saved setting or the browser's languages decide)
 *   h.waitReady(sceneKey, timeoutMs)   wait until that scene signals ready (after the last wait)
 *   h.mark()                           start counting events for waitEvent from now
 *   h.waitEvent(name, timeoutMs)       wait for an EventBus event emitted after mark()/goto()
 *   h.waitFor(fn, timeoutMs)           wait until fn() is truthy in the page
 *   h.hold(key, ms)                    hold a key for ms milliseconds
 *   h.holdUntil(key, fn, timeoutMs)    hold a key until fn() is truthy in the page
 *   h.press(key)                       press and release a key (Playwright key names: KeyE)
 *   h.click(x?, y?)                    click the canvas at game coordinates (default: corner
 *                                      2,2 - away from the menu); also unlocks WebAudio
 *   h.shot(name)                       screenshot to <out>/<name>.png, logs canvas size
 *   h.eval(fn, arg)                    run fn(arg) in the page and return its result
 *   h.teleport(x, y)                   move the hero (World scene debugTeleport)
 *   h.log(...args)                     print a line prefixed with the scenario name
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { chromium } from 'playwright-core';

const DEFAULT_TIMEOUT_MS = 15000;
/**
 * Flags for a headless box without a GPU or a user: WebGL on the SwiftShader software renderer
 * (also when the GPU is blocklisted), and sound allowed to start without a click.
 */
const CHROMIUM_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',
];

const args = parseArgs(process.argv.slice(2));
const scenarioPath = resolve(args.scenario ?? 'tools/smoke/scenarios/menu.mjs');
const outDir = resolve(args.out ?? 'smoke-out');
const [vw, vh] = (args.viewport ?? '1280x720').split('x').map(Number);
const scenarioName = basename(scenarioPath, '.mjs');

const timeoutMs = Number(args.timeout ?? 180000);

if (!vw || !vh) fail(`--viewport must look like 1280x720, got "${args.viewport}"`);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
  fail(`--timeout must be a positive number of ms`);

const problems = [];
let preview;
let browser;

// Whole-run deadline: a page-side promise that never settles must not hang CI.
const watchdog = setTimeout(() => {
  console.error(`\nSMOKE FAILED (${scenarioName}): timed out after ${timeoutMs} ms`);
  for (const problem of problems) console.error(`  - ${problem}`);
  preview?.kill();
  process.exit(1);
}, timeoutMs);

try {
  await mkdir(outDir, { recursive: true });
  const baseUrl = args.url ?? (await startPreview());
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
    headless: !args.headed,
    args: CHROMIUM_ARGS,
  });
  const context = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') problems.push(`console.error: ${text}`);
    else if (msg.type() === 'warning') log(`console.warn: ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.stack ?? error.message}`));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown';
    // A navigation that interrupts in-flight requests aborts them; that is not a game error.
    if (reason === 'net::ERR_ABORTED') return;
    problems.push(`request failed: ${request.url()} (${reason})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  const { default: scenario } = await import(pathToFileURL(scenarioPath).href);
  if (typeof scenario !== 'function') {
    throw new Error(`${scenarioPath} must export a default async function`);
  }

  log(`viewport ${vw}x${vh}, base ${baseUrl}, out ${outDir}`);
  await scenario(page, createHelpers(page, baseUrl));
} catch (error) {
  problems.push(`scenario failed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  // The preview goes first and on its own: a hung browser must not leave vite holding its port.
  preview?.kill();
  await browser?.close().catch((error) => log(`browser close failed: ${error.message}`));
}
clearTimeout(watchdog);

if (problems.length > 0) {
  console.error(`\nSMOKE FAILED (${scenarioName}): ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
log('OK');

/** Builds the helper object `h` passed to a scenario. */
function createHelpers(page, baseUrl) {
  let readySeen = 0;
  let eventMark = 0;

  const h = {
    async goto(path = '/', { lang = true } = {}) {
      const url = new URL(path.replace(/^\//, ''), baseUrl);
      url.searchParams.set('debug', '1');
      // Scenarios assert English text; the browser's own language must not decide it.
      if (lang && !url.searchParams.has('lang')) url.searchParams.set('lang', 'en');
      readySeen = 0;
      eventMark = 0;
      await page.goto(url.href);
    },

    async waitReady(sceneKey, timeoutMs = DEFAULT_TIMEOUT_MS) {
      const handle = await page
        .waitForFunction(
          ({ key, after }) =>
            (window.__nasaReadyLog ?? []).find((s) => s.key === key && s.seq > after)?.seq,
          { key: sceneKey, after: readySeen },
          { timeout: timeoutMs },
        )
        .catch(async (error) => {
          const seen = await page.evaluate(() => window.__nasaReadyLog?.map((s) => s.key));
          throw new Error(
            `waitReady('${sceneKey}') timed out; ready signals so far: ${JSON.stringify(seen)}` +
              (seen === undefined ? ' (no debug hooks: is debug=1 in the URL?)' : '') +
              `\n${error.message}`,
          );
        });
      readySeen = await handle.jsonValue();
    },

    async mark() {
      eventMark = await page.evaluate(() => window.__nasaEvents?.length ?? 0);
    },

    async waitEvent(name, timeoutMs = DEFAULT_TIMEOUT_MS) {
      const hasLog = await page.evaluate(() => Array.isArray(window.__nasaEvents));
      if (!hasLog) throw new Error(`waitEvent('${name}'): window.__nasaEvents is missing`);
      await page
        .waitForFunction(
          ({ eventName, from }) =>
            window.__nasaEvents.slice(from).some((event) => event.name === eventName),
          { eventName: name, from: eventMark },
          { timeout: timeoutMs },
        )
        .catch(async () => {
          const names = await page.evaluate(
            (from) => window.__nasaEvents.slice(from).map((e) => e.name),
            eventMark,
          );
          throw new Error(
            `waitEvent('${name}') timed out after ${timeoutMs} ms; events since mark: ` +
              `${JSON.stringify(names)}` +
              (names.length === 0
                ? ' (nothing recorded at all: are the debug hooks installed?)'
                : ''),
          );
        });
    },

    async waitFor(fn, timeoutMs = DEFAULT_TIMEOUT_MS) {
      await page.waitForFunction(fn, undefined, { timeout: timeoutMs }).catch((error) => {
        throw new Error(`waitFor(${fn}) timed out after ${timeoutMs} ms\n${error.message}`);
      });
    },

    async hold(key, ms) {
      await page.keyboard.down(key);
      await page.waitForTimeout(ms);
      await page.keyboard.up(key);
    },

    async holdUntil(key, fn, timeoutMs = DEFAULT_TIMEOUT_MS) {
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(fn, undefined, { timeout: timeoutMs, polling: 'raf' });
      } catch (error) {
        throw new Error(
          `holdUntil('${key}', ${fn}) timed out after ${timeoutMs} ms\n${error.message}`,
          { cause: error },
        );
      } finally {
        await page.keyboard.up(key);
      }
    },

    async press(key) {
      await page.keyboard.press(key);
    },

    async click(x = 2, y = 2) {
      const { box, game } = await canvasInfo(page);
      await page.mouse.click(
        box.x + (x * box.width) / game.width,
        box.y + (y * box.height) / game.height,
      );
    },

    async shot(name) {
      const file = resolve(outDir, `${name}.png`);
      await page.screenshot({ path: file });
      const { box, game } = await canvasInfo(page).catch(() => ({}));
      const size = box ? `canvas ${box.width}x${box.height} at ${box.x},${box.y}` : 'no canvas';
      const scale = box && game ? ` (x${box.width / game.width})` : '';
      log(`shot ${file} - ${size}${scale}`);
      return file;
    },

    eval(fn, arg) {
      return page.evaluate(fn, arg);
    },

    async teleport(x, y) {
      const error = await page.evaluate(
        ({ tx, ty }) => {
          const world = window.nasa?.game?.scene?.getScene('World');
          if (!world || typeof world.debugTeleport !== 'function') {
            return 'World scene with debugTeleport(x, y) is not available';
          }
          world.debugTeleport(tx, ty);
          return null;
        },
        { tx: x, ty: y },
      );
      if (error) throw new Error(`teleport(${x}, ${y}): ${error}`);
    },

    log,
  };
  return h;
}

/** Canvas bounding box in CSS pixels and the game's internal size. */
async function canvasInfo(page) {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('no visible canvas');
  const game = await page.evaluate(() => {
    const size = window.nasa?.game?.scale?.gameSize;
    return size ? { width: size.width, height: size.height } : null;
  });
  return { box, game: game ?? { width: box.width, height: box.height } };
}

/** Starts `vite preview` on a free port and resolves with its URL. */
async function startPreview() {
  const port = await freePort();
  preview = spawn(
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
  return await new Promise((resolveUrl, reject) => {
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

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail(`unexpected argument "${arg}"`);
    const name = arg.slice(2);
    if (name === 'headed') result.headed = true;
    else result[name] = argv[++i];
  }
  return result;
}

function log(...parts) {
  process.stdout.write(`[smoke:${scenarioName}] ${parts.join(' ')}\n`);
}

function fail(message) {
  console.error(`smoke: ${message}`);
  process.exit(2);
}
