#!/usr/bin/env node
/**
 * Checks that every relative Markdown link in the docs points to an existing file.
 *
 * Usage: `node tools/check-links.mjs` (also part of `npm run check`). Scans `README.md`
 * and `docs/*.md` for `[text](target)` links, skips `http(s)://`, `mailto:` and
 * pure `#anchor` targets and links inside fenced code blocks, resolves the rest against the
 * linking file's folder (the `#anchor` part is dropped) and prints every target that does not
 * exist. Exit code 1 if any is missing. No dependencies: Node only.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const SKIP = /^(?:[a-z][a-z0-9+.-]*:|#)/i; // any URL scheme (http:, mailto:) or an anchor

const files = ['README.md']
  .concat(
    readdirSync(join(ROOT, 'docs'))
      .filter((name) => name.endsWith('.md'))
      .map((name) => join('docs', name)),
  )
  .map((name) => join(ROOT, name))
  .filter((file) => existsSync(file));

let missing = 0;
for (const file of files) {
  let inFence = false;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return;
      for (const [, target] of line.matchAll(LINK)) {
        if (SKIP.test(target)) continue;
        const path = decodeURI(target.split('#')[0]);
        if (existsSync(resolve(dirname(file), path))) continue;
        missing += 1;
        console.error(`${relative(ROOT, file)}:${index + 1}: missing ${target}`);
      }
    });
}
if (missing > 0) process.exit(1);
