import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

export interface FileChange {
  path: string;
  /** Previous path when the file was renamed in this commit. */
  from?: string;
  added: number;
  deleted: number;
  binary?: boolean;
}

export interface Commit {
  hash: string;
  author: string;
  /** Author time in epoch milliseconds. */
  time: number;
  subject: string;
  files: FileChange[];
  created: string[];
  deleted: string[];
}

export interface ReadOptions {
  cwd: string;
  rev?: string;
  /** Only the most recent N commits. */
  max?: number;
  paths?: string[];
}

const RS = '\x1e';
const US = '\x1f';

function git(cwd: string, args: string[], input?: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 30, input });
  if (r.error) {
    if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('git is not installed or not on PATH');
    throw r.error;
  }
  if (r.status !== 0) throw new Error(r.stderr.trim() || `git ${args[0]} failed`);
  return r.stdout;
}

export function repoName(cwd: string): string {
  return basename(git(cwd, ['rev-parse', '--show-toplevel']).trim());
}

export function readHistory(opts: ReadOptions): Commit[] {
  const args = [
    '-c', 'core.quotepath=off',
    'log', '--reverse', '--no-merges', '-M', '--numstat', '--summary',
    `--format=${RS}%H${US}%an${US}%at${US}%s`,
  ];
  if (opts.max) args.push(`--max-count=${opts.max}`);
  args.push(opts.rev ?? 'HEAD');
  if (opts.paths?.length) args.push('--', ...opts.paths);
  return parseLog(git(opts.cwd, args));
}

/**
 * Line counts of every file just before `commits[0]`, so a partial replay
 * (--max, a range) starts from the real codebase instead of from zero.
 * Empty when the replay starts at a root commit.
 */
export function readBaseline(opts: ReadOptions, first: Commit): [string, number][] {
  const r = spawnSync('git', ['rev-parse', '--verify', '-q', `${first.hash}^`], { cwd: opts.cwd });
  if (r.status !== 0) return [];
  const emptyTree = git(opts.cwd, ['hash-object', '-t', 'tree', '--stdin'], '').trim();
  const args = ['-c', 'core.quotepath=off', 'diff', '--numstat', '--no-renames', emptyTree, `${first.hash}^`];
  if (opts.paths?.length) args.push('--', ...opts.paths);
  const files: [string, number][] = [];
  for (const line of git(opts.cwd, args).split('\n')) {
    const m = line.match(/^(-|\d+)\t(?:-|\d+)\t(.*)$/);
    if (m) files.push([m[2], m[1] === '-' ? 0 : Number(m[1])]);
  }
  return files;
}

/**
 * Parses rename notation from `git log --numstat`:
 *   "old => new", "dir/{old => new}/file", "{ => sub}/file"
 */
export function parseRename(p: string): { from: string; to: string } | null {
  const clean = (s: string) => s.replace(/\/+/g, '/').replace(/^\//, '');
  const m = p.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (m) {
    const [, pre, a, b, post] = m;
    return { from: clean(pre + a + post), to: clean(pre + b + post) };
  }
  const i = p.indexOf(' => ');
  if (i >= 0) return { from: p.slice(0, i), to: p.slice(i + 4) };
  return null;
}

export function parseLog(out: string): Commit[] {
  const commits: Commit[] = [];
  for (const rec of out.split(RS)) {
    if (!rec.trim()) continue;
    const nl = rec.indexOf('\n');
    const header = nl < 0 ? rec : rec.slice(0, nl);
    const [hash, author, at, ...rest] = header.split(US);
    const c: Commit = {
      hash,
      author,
      time: Number(at) * 1000,
      subject: rest.join(US),
      files: [],
      created: [],
      deleted: [],
    };
    const body = nl < 0 ? '' : rec.slice(nl + 1);
    for (const line of body.split('\n')) {
      if (!line) continue;
      const stat = line.match(/^(-|\d+)\t(-|\d+)\t(.*)$/);
      if (stat) {
        const binary = stat[1] === '-';
        const rename = parseRename(stat[3]);
        const change: FileChange = {
          path: rename ? rename.to : stat[3],
          added: binary ? 0 : Number(stat[1]),
          deleted: binary ? 0 : Number(stat[2]),
        };
        if (rename) change.from = rename.from;
        if (binary) change.binary = true;
        c.files.push(change);
        continue;
      }
      const mode = line.match(/^ (create|delete) mode \d+ (.*)$/);
      if (mode) (mode[1] === 'create' ? c.created : c.deleted).push(mode[2]);
    }
    commits.push(c);
  }
  return commits;
}
