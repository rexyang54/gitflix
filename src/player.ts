import type { Commit } from './git.js';
import { Replay } from './replay.js';
import { fmtDate, milestone, num } from './format.js';
import { type Seg, bar, fit, padEnd, segsWidth, sparkline, strWidth, truncate, truncateLeft } from './term.js';

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128];
/** Wall-clock length of a full replay at 1x, in ms. */
const TARGET_DURATION = 40_000;
const FRAME_MS = 16;
const BANNER_MS = 1800;

const BOLD = '1';
const DIM = '2';
const RED = '31';
const GREEN = '32';
const YELLOW = '33';
const MAGENTA = '35';
const CYAN = '36';
const DIR_COLOR = '38;5;75';
const AUTHOR_COLORS = [39, 170, 214, 76, 203, 141, 45, 220, 117, 209];

export function authorColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return `38;5;${AUTHOR_COLORS[h % AUTHOR_COLORS.length]}`;
}

export interface PlayerOptions {
  repoName: string;
  baseline?: [string, number][];
  speed?: number;
  color?: boolean;
}

export class TerminalPlayer {
  private readonly replay: Replay;
  private readonly baseMs: number;
  private readonly color: boolean;
  private speedIdx: number;
  private playing = true;
  private carry = 0;
  private timer?: NodeJS.Timeout;
  private banner?: { text: string; until: number };
  private sparkCache?: { width: number; counts: number[] };
  /** Author times can go backwards (rebases, cherry-picks), so use the real extent. */
  private readonly t0: number;
  private readonly t1: number;
  private done?: () => void;

  constructor(private readonly commits: Commit[], private readonly opts: PlayerOptions) {
    this.replay = new Replay(commits, opts.baseline);
    this.baseMs = Math.min(600, Math.max(5, TARGET_DURATION / commits.length));
    const want = opts.speed ?? 1;
    this.speedIdx = SPEEDS.reduce((best, s, i) => (Math.abs(s - want) < Math.abs(SPEEDS[best] - want) ? i : best), 0);
    this.color = opts.color ?? true;
    this.t0 = Math.min(...commits.map((c) => c.time));
    this.t1 = Math.max(this.t0 + 1, ...commits.map((c) => c.time));
  }

  /** Timeline column (0..width-1) for a timestamp. */
  private column(time: number, width: number): number {
    return Math.max(0, Math.min(width - 1, Math.floor(((time - this.t0) / (this.t1 - this.t0)) * width)));
  }

  private get ended(): boolean {
    return this.replay.index >= this.commits.length - 1;
  }

  run(): Promise<void> {
    return new Promise((resolve) => {
      this.done = resolve;
      process.stdout.write('\x1b[?1049h\x1b[?25l');
      process.stdin.setRawMode(true);
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', this.onKey);
      process.stdin.resume();
      process.stdout.on('resize', this.render);
      process.on('exit', this.restoreTerminal);
      this.step(1);
      this.render();
      this.schedule();
    });
  }

  private restoreTerminal = (): void => {
    process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  };

  private quit(): void {
    clearTimeout(this.timer);
    process.stdin.off('data', this.onKey);
    process.stdout.off('resize', this.render);
    process.off('exit', this.restoreTerminal);
    process.stdin.setRawMode(false);
    process.stdin.pause();
    this.restoreTerminal();
    this.done?.();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.playing) return;
    const ms = this.baseMs / SPEEDS[this.speedIdx];
    const delay = Math.max(FRAME_MS, ms);
    this.timer = setTimeout(() => {
      this.carry += delay / ms;
      const steps = Math.floor(this.carry);
      this.carry -= steps;
      this.step(steps);
      if (this.ended) this.playing = false;
      this.render();
      this.schedule();
    }, delay);
  }

  /** Moves forward one commit at a time so milestones are never skipped. */
  private step(n: number): void {
    for (let k = 0; k < n && !this.ended; k++) {
      const before = this.replay.totalLines;
      this.replay.seek(this.replay.index + 1);
      const m = milestone(this.replay, before);
      if (m) this.banner = { text: m, until: Date.now() + BANNER_MS };
    }
  }

  private seek(i: number): void {
    this.banner = undefined;
    this.replay.seek(Math.max(0, i));
  }

  private setPlaying(on: boolean): void {
    if (on && this.ended) this.seek(0);
    this.playing = on;
    this.schedule();
  }

  private onKey = (key: string): void => {
    const r = this.replay;
    const n = this.commits.length;
    switch (key) {
      case 'q':
      case '\x03':
        return this.quit();
      case ' ':
        this.setPlaying(!this.playing);
        break;
      case '\x1b[C':
      case 'l':
        this.setPlaying(false);
        this.step(1);
        break;
      case '\x1b[D':
      case 'h':
        this.setPlaying(false);
        this.seek(r.index - 1);
        break;
      case ']':
        this.seek(r.index + Math.max(1, Math.round(n / 10)));
        break;
      case '[':
        this.seek(r.index - Math.max(1, Math.round(n / 10)));
        break;
      case '\x1b[A':
      case '+':
      case '=':
      case 'k':
        this.speedIdx = Math.min(SPEEDS.length - 1, this.speedIdx + 1);
        this.schedule();
        break;
      case '\x1b[B':
      case '-':
      case 'j':
        this.speedIdx = Math.max(0, this.speedIdx - 1);
        this.schedule();
        break;
      case 'g':
      case '\x1b[H':
      case '\x1b[1~':
        this.seek(0);
        break;
      case 'G':
      case '\x1b[F':
      case '\x1b[4~':
        this.seek(n - 1);
        this.setPlaying(false);
        break;
      default:
        return;
    }
    this.render();
  };

  private timelineCounts(width: number): number[] {
    if (this.sparkCache?.width === width) return this.sparkCache.counts;
    const counts = new Array<number>(width).fill(0);
    for (const c of this.commits) counts[this.column(c.time, width)]++;
    this.sparkCache = { width, counts };
    return counts;
  }

  private render = (): void => {
    // One column of slack avoids auto-wrap surprises from ambiguous-width glyphs.
    const W = Math.max(40, (process.stdout.columns || 80) - 1);
    const H = Math.max(10, process.stdout.rows || 24);
    const r = this.replay;
    const c = this.commits[r.index];
    const n = this.commits.length;
    const out: Seg[][] = [];
    const rule: Seg[] = [['─'.repeat(W), DIM]];

    // Header
    const status = this.ended ? '■' : this.playing ? '▶' : '❚❚';
    const right = `${status} ${SPEEDS[this.speedIdx]}x  ${num(r.index + 1)}/${num(n)} `;
    const left: Seg[] = [[' gitflix', `${BOLD};${MAGENTA}`], [' · ', DIM], [this.opts.repoName, BOLD]];
    out.push([...left, [' '.repeat(Math.max(1, W - segsWidth(left) - strWidth(right)))], [right, CYAN]]);
    out.push(rule);

    // Current commit
    out.push([[` ${fmtDate(c.time)}`, DIM], [`  ${c.hash.slice(0, 7)}`, YELLOW], [`  ${c.author}`, `${BOLD};${authorColor(c.author)}`]]);
    out.push([[` ${c.subject}`, BOLD]]);

    // Fixed rows: header, rule, 2 card, rule, stats, banner, block heading, rule, 3 timeline, footer.
    const avail = Math.max(2, H - 14);
    const fileRows = Math.min(c.files.length, Math.max(1, Math.ceil(avail * 0.45)));
    const blockRows = avail - fileRows;
    out.push(...this.renderFiles(c, fileRows, W));

    out.push(rule);
    const day = Math.floor((c.time - this.t0) / 86_400_000) + 1;
    out.push([
      [` ${num(r.totalLines)}`, BOLD], [' lines  ·  ', DIM],
      [num(r.files.size), BOLD], [' files  ·  ', DIM],
      [num(r.authors.size), BOLD], [' authors  ·  ', DIM],
      ['day ', DIM], [num(day), BOLD],
    ]);
    const banner = this.banner && this.banner.until > Date.now() ? this.banner.text : '';
    out.push([[banner ? ` ${banner}` : '', `${BOLD};${YELLOW}`]]);

    out.push(...this.renderBlocks(blockRows + 1, W));
    out.push(rule);
    out.push(...this.renderTimeline(c, W));

    out.push(
      this.ended
        ? [[' ■ the end', `${BOLD};${MAGENTA}`], ['  ·  space replay  ·  ←/→ step  ·  q quit', DIM]]
        : [[' space', BOLD], [' play/pause  ', DIM], ['←/→', BOLD], [' step  ', DIM], ['[ ]', BOLD], [' jump  ', DIM],
           ['↑/↓', BOLD], [' speed  ', DIM], ['g/G', BOLD], [' start/end  ', DIM], ['q', BOLD], [' quit', DIM]],
    );

    const rows = out.length > H ? [...out.slice(0, H - 1), out[out.length - 1]] : out;
    process.stdout.write('\x1b[H' + rows.map((l) => fit(l, W, this.color)).join('\r\n') + '\x1b[J');

    // Keep the banner from lingering while paused.
    if (banner && !this.playing) setTimeout(this.render, this.banner!.until - Date.now() + 10);
  };

  private renderFiles(c: Commit, rows: number, W: number): Seg[][] {
    const created = new Set(c.created);
    const deleted = new Set(c.deleted);
    const files = [...c.files].sort((a, b) => b.added + b.deleted - (a.added + a.deleted));
    const max = Math.max(1, ...files.map((f) => f.added + f.deleted));
    const barW = Math.min(30, Math.floor(W * 0.25));
    const numW = 14;
    const pathW = Math.max(10, W - 3 - 1 - barW - 1 - numW);
    const more = files.length - rows;
    const shown = files.slice(0, more > 0 ? rows - 1 : rows);

    const lines: Seg[][] = shown.map((f) => {
      const [mark, markStyle] = created.has(f.path) ? ['+', GREEN]
        : deleted.has(f.path) ? ['✕', RED]
        : f.from ? ['→', CYAN]
        : ['~', YELLOW];
      const label = f.from ? `${f.from} → ${f.path}` : f.path;
      const total = f.added + f.deleted;
      const cells = total > 0 ? Math.max(1, Math.round((total / max) * barW)) : 0;
      const green = total > 0 ? Math.round((cells * f.added) / total) : 0;
      return [
        [` ${mark} `, markStyle],
        [padEnd(truncateLeft(label, pathW), pathW) + ' '],
        ['█'.repeat(green), GREEN],
        ['█'.repeat(cells - green), RED],
        [' '.repeat(barW - cells + 1)],
        ...(f.binary
          ? [['binary', DIM] as Seg]
          : [[`+${num(f.added)}`, GREEN] as Seg, [` −${num(f.deleted)}`, RED] as Seg]),
      ];
    });
    if (more > 0) lines.push([[`   … and ${num(more + 1)} more files`, DIM]]);
    if (files.length === 0) lines.push([['   (no file changes)', DIM]]);
    return lines;
  }

  /** Directories and authors, side by side when the terminal is wide enough. */
  private renderBlocks(rows: number, W: number): Seg[][] {
    const wide = W >= 90;
    const colW = wide ? Math.floor((W - 2) / 2) : W;
    const per = wide ? rows - 1 : Math.floor((rows - 2) / 2);
    const r = this.replay;

    const nameW = Math.min(24, Math.floor(colW * 0.35));
    const valW = 14;
    const barW = Math.max(4, colW - nameW - valW - 4);

    const dirs = r.topDirs(Math.max(0, per));
    const dirMax = dirs[0]?.[1] ?? 1;
    const left: Seg[][] = [[[' Directories', BOLD]]];
    for (const [d, lines] of dirs) {
      left.push([
        [' ' + padEnd(truncateLeft(d, nameW), nameW) + ' '],
        [padEnd(bar(lines, dirMax, barW), barW), DIR_COLOR],
        [' ' + num(lines).padStart(valW - 1), DIM],
      ]);
    }

    const authors = r.topAuthors(Math.max(0, per));
    const authorMax = authors[0]?.[1].commits ?? 1;
    const right: Seg[][] = [[[' Authors', BOLD]]];
    for (const [name, s] of authors) {
      const color = authorColor(name);
      right.push([
        [' ' + padEnd(truncate(name, nameW), nameW) + ' ', color],
        [padEnd(bar(s.commits, authorMax, barW), barW), color],
        [' ' + `${num(s.commits)} commit${s.commits === 1 ? '' : 's'}`.padStart(valW - 1), DIM],
      ]);
    }

    const out: Seg[][] = [];
    if (wide) {
      for (let i = 0; i < rows; i++) {
        const l = left[i] ?? [];
        out.push([...l, [' '.repeat(Math.max(0, colW - segsWidth(l)) + 2)], ...(right[i] ?? [])]);
      }
    } else {
      out.push(...left);
      while (out.length < per + 2) out.push([]);
      out.push(...right);
      while (out.length < rows) out.push([]);
    }
    return out.slice(0, rows);
  }

  private renderTimeline(c: Commit, W: number): Seg[][] {
    const width = W - 2;
    const counts = this.timelineCounts(width);
    const pos = this.column(c.time, width);
    const spark = sparkline(counts);
    const startLabel = fmtDate(this.t0, false);
    const endLabel = fmtDate(this.t1, false);
    return [
      [[' ' + spark.slice(0, pos + 1), MAGENTA], [spark.slice(pos + 1), DIM]],
      [[' ' + ' '.repeat(pos)], ['▲', `${BOLD};${MAGENTA}`]],
      [[' ' + startLabel, DIM], [' '.repeat(Math.max(1, width - startLabel.length - endLabel.length))], [endLabel, DIM]],
    ];
  }
}
