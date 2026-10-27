/** A run of text with an optional SGR style, e.g. ['hello', '1;32']. */
export type Seg = [text: string, style?: string];

export function charWidth(cp: number): number {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) return 2;
  return 1;
}

export function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0)!);
  return w;
}

/** Cuts `s` to at most `w` columns, ending with an ellipsis when cut. */
export function truncate(s: string, w: number): string {
  if (strWidth(s) <= w) return s;
  if (w <= 0) return '';
  let out = '';
  let used = 0;
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0)!);
    if (used + cw > w - 1) break;
    out += ch;
    used += cw;
  }
  return out + '…';
}

/** Like truncate, but keeps the end of the string (for file paths). */
export function truncateLeft(s: string, w: number): string {
  if (strWidth(s) <= w) return s;
  if (w <= 0) return '';
  const chars = [...s];
  let out = '';
  let used = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const cw = charWidth(chars[i].codePointAt(0)!);
    if (used + cw > w - 1) break;
    out = chars[i] + out;
    used += cw;
  }
  return '…' + out;
}

export function padEnd(s: string, w: number): string {
  return s + ' '.repeat(Math.max(0, w - strWidth(s)));
}

export function segsWidth(segs: Seg[]): number {
  return segs.reduce((n, [t]) => n + strWidth(t), 0);
}

/** Renders segments into exactly `w` columns. */
export function fit(segs: Seg[], w: number, color: boolean): string {
  let out = '';
  let used = 0;
  for (const [text, style] of segs) {
    if (used >= w) break;
    const piece = used + strWidth(text) > w ? truncate(text, w - used) : text;
    used += strWidth(piece);
    out += style && color ? `\x1b[${style}m${piece}\x1b[0m` : piece;
  }
  return out + ' '.repeat(Math.max(0, w - used));
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

/** A horizontal bar with 1/8-cell resolution. Non-zero values are always visible. */
export function bar(value: number, max: number, width: number): string {
  if (max <= 0 || width <= 0 || value <= 0) return '';
  const units = Math.max(1, Math.round(Math.min(1, value / max) * width * 8));
  return '█'.repeat(Math.floor(units / 8)) + EIGHTHS[units % 8];
}

const SPARK = '▁▂▃▄▅▆▇█';

export function sparkline(counts: number[]): string {
  const max = Math.max(1, ...counts);
  return counts.map((n) => (n === 0 ? ' ' : SPARK[Math.min(7, Math.floor((n / max) * 7.999))])).join('');
}
