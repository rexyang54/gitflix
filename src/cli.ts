#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readBaseline, readHistory, repoName } from './git.js';
import { renderHtml } from './html.js';
import { summary, num } from './format.js';
import { TerminalPlayer } from './player.js';

const HELP = `
  gitflix — watch your git history like a movie

  Usage
    $ gitflix [repo-dir] [options]

  Options
    -o, --html <file>    Export a self-contained, shareable HTML replay
    -n, --max <count>    Only the most recent <count> commits
    -r, --rev <rev>      Branch, tag or range to replay (default: HEAD)
    -p, --path <path>    Only commits touching <path> (repeatable)
    -s, --speed <x>      Starting speed multiplier (default: 1)
        --summary        Print a text summary instead of playing
        --no-color       Disable colors
    -h, --help           Show this help
    -v, --version        Show version

  Controls
    space play/pause · ←/→ step · [ ] jump 10% · ↑/↓ speed · g/G start/end · q quit

  Examples
    $ npx gitflix
    $ npx gitflix ~/code/my-app --max 500
    $ npx gitflix --html replay.html
`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return pkg.version;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      html: { type: 'string', short: 'o' },
      max: { type: 'string', short: 'n' },
      rev: { type: 'string', short: 'r' },
      path: { type: 'string', short: 'p', multiple: true },
      speed: { type: 'string', short: 's' },
      summary: { type: 'boolean' },
      'no-color': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (values.help) return void console.log(HELP);
  if (values.version) return void console.log(version());

  const max = values.max ? Number(values.max) : undefined;
  if (max !== undefined && !(Number.isInteger(max) && max > 0)) throw new Error('--max must be a positive integer');
  const speed = values.speed ? Number(values.speed) : 1;
  if (!(speed > 0)) throw new Error('--speed must be a positive number');

  const cwd = resolve(positionals[0] ?? '.');
  const name = repoName(cwd);
  const opts = { cwd, rev: values.rev, max, paths: values.path };
  const commits = readHistory(opts);
  if (commits.length === 0) throw new Error('no commits to replay');
  const baseline = readBaseline(opts, commits[0]);

  if (values.html) {
    const file = resolve(values.html);
    const html = renderHtml(commits, name, baseline);
    writeFileSync(file, html);
    console.log(`🎬 ${num(commits.length)} commits of ${name} → ${file} (${(html.length / 1024).toFixed(0)} KB)`);
    console.log('   Open it in a browser, or host it anywhere (GitHub Pages, Netlify, a gist preview).');
    return;
  }

  const color = !values['no-color'] && !process.env.NO_COLOR;
  if (values.summary || !process.stdout.isTTY || !process.stdin.isTTY) {
    console.log(summary(commits, name, baseline));
    return;
  }

  await new TerminalPlayer(commits, { repoName: name, baseline, speed, color }).run();
  console.log(summary(commits, name, baseline));
  console.log('\n  🍿 Share it: npx gitflix --html replay.html\n');
}

main().catch((err: Error) => {
  console.error(`gitflix: ${err.message}`);
  process.exit(1);
});
