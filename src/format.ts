import type { Commit } from './git.js';
import { Replay } from './replay.js';

export const num = (n: number): string => n.toLocaleString('en-US');

const pad2 = (n: number) => String(n).padStart(2, '0');

export function fmtDate(ms: number, withTime = true): string {
  const d = new Date(ms);
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return withTime ? `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : date;
}

export function fmtSpan(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return 'less than a day';
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

const LINE_MILESTONES = [1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 10_000_000];
const COMMIT_MILESTONES = [100, 500, 1_000, 5_000, 10_000, 50_000, 100_000];

/** A celebratory message when going from `before` to the replay's current state, if any. */
export function milestone(r: Replay, beforeLines: number): string | null {
  const n = r.index + 1;
  if (n === 1) return r.baseline.length ? null : '🌱 first commit';
  const crossed = LINE_MILESTONES.filter((m) => beforeLines < m && r.totalLines >= m).pop();
  if (crossed) return `🎉 ${num(crossed)} lines of code!`;
  if (COMMIT_MILESTONES.includes(n)) return `🚀 commit #${num(n)}`;
  return null;
}

export function summary(commits: Commit[], name: string, baseline: [string, number][] = []): string {
  const r = new Replay(commits, baseline);
  r.seek(commits.length - 1);
  const times = commits.map((c) => c.time);
  const first = { time: Math.min(...times) };
  const last = { time: Math.max(...times) };
  const lines = [
    `${name}: ${num(commits.length)} commits by ${num(r.authors.size)} authors over ${fmtSpan(last.time - first.time)}`,
    `  ${fmtDate(first.time, false)} → ${fmtDate(last.time, false)} · ${num(r.totalLines)} lines in ${num(r.files.size)} files`,
    '',
    '  Top directories',
    ...r.topDirs(5).map(([d, n]) => `    ${d.padEnd(24)} ${num(n).padStart(10)} lines`),
    '',
    '  Top authors',
    ...r.topAuthors(5).map(([a, s]) => `    ${a.padEnd(24)} ${num(s.commits).padStart(10)} commits`),
  ];
  return lines.join('\n');
}
