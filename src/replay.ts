import type { Commit } from './git.js';

export interface AuthorStats {
  commits: number;
  added: number;
  deleted: number;
}

/**
 * Rebuilds the state of a codebase commit by commit.
 *
 * This class must stay self-contained (no imports used at runtime, no outside
 * helpers): the HTML export embeds its source via `Replay.toString()`.
 */
export class Replay {
  readonly commits: Commit[];
  /** File line counts before the first commit (for partial histories). */
  readonly baseline: [string, number][];
  /** Index of the last applied commit; -1 before the first. */
  index = -1;
  files = new Map<string, number>();
  dirs = new Map<string, number>();
  authors = new Map<string, AuthorStats>();
  totalLines = 0;

  constructor(commits: Commit[], baseline: [string, number][] = []) {
    this.commits = commits;
    this.baseline = baseline;
    this.reset();
  }

  static dirOf(path: string): string {
    const i = path.indexOf('/');
    return i < 0 ? '/' : path.slice(0, i + 1);
  }

  reset(): void {
    this.index = -1;
    this.files = new Map();
    this.dirs = new Map();
    this.authors = new Map();
    this.totalLines = 0;
    for (const [path, lines] of this.baseline) this.addLines(path, lines);
  }

  seek(target: number): void {
    const i = Math.max(-1, Math.min(this.commits.length - 1, target));
    if (i < this.index) this.reset();
    while (this.index < i) this.apply(this.commits[++this.index]);
  }

  private addLines(path: string, delta: number): void {
    const cur = this.files.get(path) ?? 0;
    const next = Math.max(0, cur + delta);
    this.files.set(path, next);
    const dir = Replay.dirOf(path);
    this.dirs.set(dir, (this.dirs.get(dir) ?? 0) + next - cur);
    this.totalLines += next - cur;
  }

  private remove(path: string): number {
    const cur = this.files.get(path);
    if (cur === undefined) return 0;
    this.files.delete(path);
    const dir = Replay.dirOf(path);
    this.dirs.set(dir, (this.dirs.get(dir) ?? 0) - cur);
    this.totalLines -= cur;
    return cur;
  }

  private apply(c: Commit): void {
    let a = this.authors.get(c.author);
    if (!a) this.authors.set(c.author, (a = { commits: 0, added: 0, deleted: 0 }));
    a.commits++;
    for (const f of c.files) {
      if (f.from && f.from !== f.path) this.addLines(f.path, this.remove(f.from));
      this.addLines(f.path, f.added - f.deleted);
      a.added += f.added;
      a.deleted += f.deleted;
    }
    for (const p of c.deleted) this.remove(p);
  }

  topDirs(k: number): [string, number][] {
    return [...this.dirs].filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).slice(0, k);
  }

  topAuthors(k: number): [string, AuthorStats][] {
    return [...this.authors].sort((x, y) => y[1].commits - x[1].commits).slice(0, k);
  }
}
