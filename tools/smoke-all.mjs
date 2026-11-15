#!/usr/bin/env node
/**
 * Every smoke scenario of `tools/smoke/scenarios/`, several at once: one `vite preview` for all,
 * each scenario in its own `tools/smoke.mjs` process (its own browser). Prints a line per
 * scenario as it ends, the whole output of a failed one, and exits 1 if any failed.
 *
 * Usage:
 *   npm run smoke:all                       # build, then all of them
 *   npm run smoke:all -- --gpu              # on the machine's GPU: several times faster
 *   node tools/smoke-all.mjs [--pages 4] [--only menu,ship] [--gpu] [--out smoke-out]
 *
 * Needs a fresh `npm run build` (dist/). `--pages`: game pages open at a time; by default an
 * eighth of the CPU threads on the software renderer (it draws on every core, so pages get in
 * each other's way), a third of them with `--gpu`. More is not faster: an overloaded machine
 * draws fewer frames, the game falls behind the clock and the scenarios' waits time out. A
 * scenario takes one page, or up to its `pages` export (`locale` runs its parts side by side,
 * `h.parallel`). A scenario's log is kept in `<out>/logs/<name>.log`.
 */
import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { startPreview } from './smoke/preview.mjs';

const SCENARIOS_DIR = 'tools/smoke/scenarios';
/** The whole-run limit of one scenario, ms (the long ones need more than smoke.mjs's default). */
const TIMEOUT_MS = 600000;
/** The longest scenarios, started first so the short ones fill in around them. */
const LONGEST_FIRST = ['voyage', 'locale', 'stations', 'ship', 'death-loop'];

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(args.out ?? 'smoke-out');
const budget = Number(
  args.pages ?? Math.max(1, Math.floor(availableParallelism() / (args.gpu ? 3 : 8))),
);
if (!Number.isInteger(budget) || budget < 1) fail('--pages must be a positive whole number');

const all = (await readdir(SCENARIOS_DIR))
  .filter((file) => file.endsWith('.mjs'))
  .map((file) => basename(file, '.mjs'));
const only = args.only?.split(',');
for (const name of only ?? []) {
  if (!all.includes(name)) fail(`no scenario "${name}" (have: ${all.join(', ')})`);
}
const rank = (name) => LONGEST_FIRST.indexOf(name) + 1 || LONGEST_FIRST.length + 1;
const names = (only ?? all).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
/** What is left to run: each scenario and the pages it can use at once (its `pages` export). */
const queue = await Promise.all(
  names.map(async (name) => {
    const module = await import(pathToFileURL(resolve(SCENARIOS_DIR, `${name}.mjs`)).href);
    return { name, pages: module.pages ?? 1 };
  }),
);

await mkdir(resolve(outDir, 'logs'), { recursive: true });
const startedAt = Date.now();
const preview = await startPreview();
process.on('SIGINT', () => {
  preview.process.kill();
  process.exit(130);
});
process.stdout.write(
  `[smoke:all] ${names.length} scenarios, ${budget} pages at a time, ${preview.url}\n`,
);

const failed = [];
let free = budget;
try {
  await new Promise((done) => {
    let running = 0;
    // Starts queued scenarios while pages are free; one that can use several gets what is free.
    const fill = () => {
      while (free > 0 && queue.length > 0) {
        const { name, pages } = queue.shift();
        const granted = Math.min(pages, free);
        free -= granted;
        running += 1;
        void runAndReport(name, granted).then(() => {
          free += granted;
          running -= 1;
          fill();
        });
      }
      if (running === 0 && queue.length === 0) done();
    };
    fill();
  });
} finally {
  preview.process.kill();
}
const total = seconds(Date.now() - startedAt);
if (failed.length > 0) {
  console.error(`\nSMOKE FAILED: ${failed.join(', ')} (${names.length} scenarios, ${total})`);
  process.exit(1);
}
process.stdout.write(`[smoke:all] OK: ${names.length} scenarios in ${total}\n`);

/** Runs scenario `name` on `pages` pages, keeps its log and prints its line. */
async function runAndReport(name, pages) {
  const began = Date.now();
  const { code, output } = await runScenario(name, pages);
  await writeFile(resolve(outDir, 'logs', `${name}.log`), output);
  const took = seconds(Date.now() - began);
  if (code === 0) {
    process.stdout.write(`[smoke:all] ok     ${name} (${took})\n`);
  } else {
    failed.push(name);
    process.stdout.write(`[smoke:all] FAILED ${name} (${took})\n${output}\n`);
  }
}

/** Runs one scenario with tools/smoke.mjs against the shared preview; resolves when it exits. */
function runScenario(name, pages) {
  const child = spawn(
    process.execPath,
    [
      resolve('tools/smoke.mjs'),
      '--scenario',
      resolve(SCENARIOS_DIR, `${name}.mjs`),
      '--url',
      preview.url,
      '--out',
      outDir,
      '--timeout',
      String(TIMEOUT_MS),
      '--pages',
      String(pages),
      ...(args.gpu ? ['--gpu'] : []),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  return new Promise((done) => child.on('exit', (code) => done({ code: code ?? 1, output })));
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)} s`;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail(`unexpected argument "${arg}"`);
    const name = arg.slice(2);
    if (name === 'gpu') result.gpu = true;
    else result[name] = argv[++i];
  }
  return result;
}

function fail(message) {
  console.error(`smoke:all: ${message}`);
  process.exit(2);
}
