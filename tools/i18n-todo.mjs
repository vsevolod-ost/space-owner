#!/usr/bin/env node
/**
 * Reports the state of the Ukrainian translation (docs/HOWTO-localization.md).
 *
 * Usage: `npm run i18n:todo` (or `node tools/i18n-todo.mjs [--strict]`). Parses every `.ts`
 * file under `src/` with the TypeScript compiler and finds the `LocalText` pairs: object
 * literals whose properties are exactly `en`, `uk` and optionally `max`. Prints a table of the
 * files with pairs: how many still have `uk: TODO`, how many are translated, and the totals.
 * Then lists the pairs whose `uk` (or `en`) text is longer than its `max`, and the pairs whose
 * `uk` is neither `TODO` nor a plain string (the tool cannot measure those).
 *
 * `src/core/locale/` is skipped: it defines the model (`LANGUAGE_NAMES` has the same shape but
 * is not a translatable string). Exit code 0 always: it is a report. With `--strict`, exit
 * code 1 when a pair is over its `max` (TODOs are expected and never fail it).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const SKIP_DIRS = [join(SRC, 'core', 'locale')];
const strict = process.argv.includes('--strict');

/** Every `.ts` file under `dir`, sorted, except the skipped folders. */
function tsFiles(dir) {
  if (SKIP_DIRS.includes(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return tsFiles(path);
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [path] : [];
    });
}

/** The name of a property assignment (`en`, `'uk'`), or undefined for spreads and methods. */
function propName(prop) {
  if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) return;
  const name = prop.name;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
}

/** The text of a string literal or a template without substitutions; undefined otherwise. */
function stringValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
}

const rows = []; // { file, todo, done }
const overMax = []; // { where, lang, length, max, text }
const unknown = []; // { where, kind }

for (const file of tsFiles(SRC)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const name = relative(ROOT, file);
  let todo = 0;
  let done = 0;
  // `max: NAME_CHARS`: numeric constants declared anywhere in the same file.
  const constants = new Map();
  const collect = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isNumericLiteral(node.initializer)
    ) {
      constants.set(node.name.text, Number(node.initializer.text));
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const props = new Map(node.properties.map((p) => [propName(p), p]));
      const keys = [...props.keys()];
      const isPair =
        props.has('en') &&
        props.has('uk') &&
        keys.every((key) => key === 'en' || key === 'uk' || key === 'max');
      if (isPair) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const where = `${name}:${line}`;
        const value = (key) => {
          const prop = props.get(key);
          return prop && ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
        };
        const en = value('en') && stringValue(value('en'));
        const ukNode = value('uk');
        const maxNode = value('max');
        let max;
        if (maxNode && ts.isNumericLiteral(maxNode)) max = Number(maxNode.text);
        else if (maxNode && ts.isIdentifier(maxNode)) max = constants.get(maxNode.text);
        if (maxNode && max === undefined) {
          unknown.push({ where, kind: `max: ${maxNode.getText(source)}` });
        }
        const uk = ukNode && stringValue(ukNode);
        if (ukNode && ts.isIdentifier(ukNode) && ukNode.text === 'TODO') todo += 1;
        else if (uk !== undefined) done += 1;
        else unknown.push({ where, kind: ukNode ? ukNode.getText(source) : '(shorthand)' });
        if (max !== undefined) {
          if (en !== undefined && en.length > max) {
            overMax.push({ where, lang: 'en', length: en.length, max, text: en });
          }
          if (uk !== undefined && uk.length > max) {
            overMax.push({ where, lang: 'uk', length: uk.length, max, text: uk });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (todo + done > 0) rows.push({ file: name, todo, done });
}

rows.sort((a, b) => b.todo - a.todo || a.file.localeCompare(b.file));
const total = rows.reduce((sum, r) => ({ todo: sum.todo + r.todo, done: sum.done + r.done }), {
  todo: 0,
  done: 0,
});
const width = Math.max('Total'.length, ...rows.map((r) => r.file.length));
const out = [];
const row = (file, todo, done) =>
  `${file.padEnd(width)}  ${String(todo).padStart(5)}  ${String(done).padStart(5)}`;

out.push(row('File', 'TODO', 'done'), '-'.repeat(width + 14));
for (const r of rows) out.push(row(r.file, r.todo, r.done));
out.push('-'.repeat(width + 14), row('Total', total.todo, total.done));
const pairs = total.todo + total.done;
const percent = pairs === 0 ? 100 : Math.floor((total.done * 100) / pairs);
out.push('', `${total.todo} of ${pairs} pairs wait for a Ukrainian text (${percent}% done).`);

out.push('', overMax.length === 0 ? 'No pair is over its max.' : 'Over their max:');
for (const o of overMax) {
  out.push(`  ${o.where}  ${o.lang} ${o.length} > max ${o.max}: ${JSON.stringify(o.text)}`);
}
if (unknown.length > 0) {
  out.push('', 'Not measured (uk is neither TODO nor a plain string, or max is not a number):');
  for (const u of unknown)
    out.push(`  ${u.where}  ${u.kind.startsWith('max:') ? '' : 'uk: '}${u.kind}`);
}
process.stdout.write(`${out.join('\n')}\n`);
if (strict && overMax.length > 0) process.exit(1);
