import type { Commit } from './git.js';
import { Replay } from './replay.js';

/**
 * Packs commits into index-based arrays so large histories stay small:
 * paths and author names are stored once and referenced by index.
 */
export function packCommits(commits: Commit[], baseline: [string, number][] = []) {
  const paths: string[] = [];
  const pathIdx = new Map<string, number>();
  const authors: string[] = [];
  const authorIdx = new Map<string, number>();
  const intern = (table: string[], idx: Map<string, number>, s: string) => {
    let i = idx.get(s);
    if (i === undefined) idx.set(s, (i = table.push(s) - 1));
    return i;
  };
  const p = (s: string) => intern(paths, pathIdx, s);
  const packed = commits.map((c) => [
    c.hash.slice(0, 7),
    intern(authors, authorIdx, c.author),
    Math.round(c.time / 1000),
    c.subject,
    c.files.map((f) => [p(f.path), f.added, f.deleted, f.from ? p(f.from) : -1, f.binary ? 1 : 0]),
    c.created.map(p),
    c.deleted.map(p),
  ]);
  return { paths, authors, commits: packed, baseline: baseline.map(([path, n]) => [p(path), n]) };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

export function renderHtml(commits: Commit[], repo: string, baseline: [string, number][] = []): string {
  // Escaping "<" keeps "</script>" inside commit subjects from closing the tag.
  const data = JSON.stringify({ repo, ...packCommits(commits, baseline) }).replace(/</g, '\\u003c');
  return TEMPLATE.replace('__TITLE__', escapeHtml(repo))
    .replace('__DATA__', () => data)
    .replace('__REPLAY__', () => Replay.toString());
}

const TEMPLATE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__ · gitflix</title>
<style>
:root {
  --bg: #0b0b10; --panel: #15151d; --line: #262633; --text: #ececf1; --muted: #8b8b9e;
  --accent: #e50914; --accent2: #ff5b6b; --add: #3fb950; --del: #f85149; --dir: #58a6ff;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg: #f6f6f8; --panel: #ffffff; --line: #e3e3ea; --text: #16161d; --muted: #6a6a7a;
    --accent: #d10812; --accent2: #e8434f; --add: #1a7f37; --del: #cf222e; --dir: #0969da;
    color-scheme: light;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--bg); color: var(--text);
  font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  padding: 24px 16px 96px; max-width: 1180px; margin: 0 auto;
}
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
header { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }
.brand { color: var(--accent); font-weight: 900; letter-spacing: .04em; text-transform: uppercase; font-size: 22px; }
h1 { margin: 0; font-size: 22px; font-weight: 700; }
.range { color: var(--muted); font-size: 13px; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.stat b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; line-height: 1.15; }
.stat span { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
.grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 14px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px; min-width: 0; }
.now { grid-row: span 2; }
.card h3 { margin: 0 0 10px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
.meta { display: flex; align-items: center; gap: 10px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; color: #fff; flex: none; }
.who { min-width: 0; flex: 1; }
.who div:first-child { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { color: var(--muted); font-size: 13px; }
.hash { color: var(--muted); font-size: 12px; background: var(--bg); border: 1px solid var(--line); padding: 2px 6px; border-radius: 6px; }
h2 { font-size: 18px; margin: 12px 0 14px; overflow-wrap: anywhere; }
ul { list-style: none; margin: 0; padding: 0; }
.files li { display: grid; grid-template-columns: 18px minmax(0, 1fr) 110px 92px; align-items: center; gap: 8px; padding: 3px 0; font-size: 13px; }
.files .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.files .path bdi { direction: ltr; }
.mark { font-weight: 800; text-align: center; }
.diff { display: flex; height: 8px; border-radius: 4px; overflow: hidden; }
.diff i { display: block; height: 100%; }
.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.add { color: var(--add); } .del { color: var(--del); }
.more { color: var(--muted); font-size: 13px; padding-top: 6px; }
.bars li { display: grid; grid-template-columns: minmax(0, 9em) 1fr auto; gap: 10px; align-items: center; padding: 4px 0; font-size: 13px; }
.bars .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bars .track { height: 10px; background: var(--line); border-radius: 5px; overflow: hidden; }
.bars .fill { display: block; height: 100%; border-radius: 5px; transition: width .25s ease; }
.bars .v { color: var(--muted); font-variant-numeric: tabular-nums; }
#banner { position: fixed; left: 50%; top: 20px; transform: translate(-50%, -20px); opacity: 0; transition: .3s; background: var(--accent); color: #fff;
  font-weight: 800; padding: 10px 18px; border-radius: 999px; pointer-events: none; box-shadow: 0 8px 30px rgba(0,0,0,.35); z-index: 10; }
#banner.show { opacity: 1; transform: translate(-50%, 0); }
.player { position: fixed; left: 0; right: 0; bottom: 0; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px);
  border-top: 1px solid var(--line); padding: 10px 16px; }
.player-inner { max-width: 1180px; margin: 0 auto; display: flex; align-items: center; gap: 10px; }
button, select { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 8px; height: 34px; min-width: 34px; font: inherit; cursor: pointer; }
#play { background: var(--accent); border-color: var(--accent); color: #fff; min-width: 44px; font-size: 16px; }
.timeline { flex: 1; position: relative; height: 34px; min-width: 0; }
#spark { position: absolute; inset: 0 0 8px 0; width: 100%; height: 26px; }
#scrub { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; margin: 0; accent-color: var(--accent); }
.credit { text-align: center; color: var(--muted); font-size: 12px; margin-top: 22px; }
@media (max-width: 760px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .grid { grid-template-columns: 1fr; }
  .now { grid-row: auto; }
  .files li { grid-template-columns: 18px minmax(0, 1fr) 84px; }
  .files .diff { display: none; }
  #prev, #next, #speed { display: none; }
}
</style>
</head>
<body>
<header>
  <div class="brand">gitflix</div>
  <h1 id="repo"></h1>
  <div class="range" id="range"></div>
</header>
<section class="stats">
  <div class="stat"><b id="s-commits">0</b><span>commits</span></div>
  <div class="stat"><b id="s-lines">0</b><span>lines of code</span></div>
  <div class="stat"><b id="s-files">0</b><span>files</span></div>
  <div class="stat"><b id="s-authors">0</b><span>authors</span></div>
</section>
<main class="grid">
  <section class="card now">
    <div class="meta">
      <div class="avatar" id="avatar"></div>
      <div class="who"><div id="author"></div><div class="sub" id="when"></div></div>
      <code class="hash" id="hash"></code>
    </div>
    <h2 id="subject"></h2>
    <ul class="files" id="files"></ul>
  </section>
  <section class="card"><h3>Directories</h3><ul class="bars" id="dirs"></ul></section>
  <section class="card"><h3>Authors</h3><ul class="bars" id="authors"></ul></section>
</main>
<p class="credit">Made with <code>npx gitflix</code></p>
<div id="banner"></div>
<div class="player"><div class="player-inner">
  <button id="prev" title="Previous commit (←)">⏮</button>
  <button id="play" title="Play / pause (space)">❚❚</button>
  <button id="next" title="Next commit (→)">⏭</button>
  <div class="timeline"><svg id="spark" preserveAspectRatio="none"></svg><input id="scrub" type="range" min="0" value="0" aria-label="Timeline"></div>
  <select id="speed" title="Speed (↑/↓)"></select>
</div></div>
<script>
const DATA = __DATA__;
__REPLAY__
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var fmt = function (n) { return n.toLocaleString('en-US'); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var fmtDate = function (ms, time) {
    var d = new Date(ms), s = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return time ? s + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : s;
  };
  var hue = function (name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return h % 360; };
  var authorColor = function (name) { return 'hsl(' + hue(name) + ' 65% 55%)'; };

  var P = DATA.paths, A = DATA.authors;
  var commits = DATA.commits.map(function (c) {
    return {
      hash: c[0], author: A[c[1]], time: c[2] * 1000, subject: c[3],
      files: c[4].map(function (f) { return { path: P[f[0]], added: f[1], deleted: f[2], from: f[3] >= 0 ? P[f[3]] : undefined, binary: f[4] === 1 }; }),
      created: c[5].map(function (i) { return P[i]; }),
      deleted: c[6].map(function (i) { return P[i]; })
    };
  });
  var N = commits.length;
  var t0 = commits.reduce(function (m, c) { return Math.min(m, c.time); }, Infinity);
  var t1 = Math.max(t0 + 1, commits.reduce(function (m, c) { return Math.max(m, c.time); }, -Infinity));
  var col = function (t, w) { return Math.max(0, Math.min(w - 1, Math.floor((t - t0) / (t1 - t0) * w))); };
  var r = new Replay(commits, DATA.baseline.map(function (b) { return [P[b[0]], b[1]]; }));

  document.title = DATA.repo + ' · gitflix';
  $('repo').textContent = DATA.repo;
  $('range').textContent = fmtDate(t0) + ' → ' + fmtDate(t1) + ' · ' + fmt(N) + ' commits';
  $('scrub').max = N - 1;

  // Timeline sparkline
  var B = 120, counts = new Array(B).fill(0);
  commits.forEach(function (c) { counts[col(c.time, B)]++; });
  var cmax = Math.max.apply(null, counts), svg = $('spark');
  svg.setAttribute('viewBox', '0 0 ' + B + ' 26');
  svg.innerHTML = counts.map(function (n, i) {
    var h = n ? Math.max(2, n / cmax * 26) : 0;
    return '<rect x="' + (i + 0.1) + '" y="' + (26 - h) + '" width="0.8" height="' + h + '" rx="0.3"/>';
  }).join('');
  var rects = svg.querySelectorAll('rect');

  var SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128], speed = 1;
  $('speed').innerHTML = SPEEDS.map(function (s) { return '<option value="' + s + '"' + (s === 1 ? ' selected' : '') + '>' + s + '×</option>'; }).join('');

  function keyedBars(el, rows, max, color, label) {
    var existing = {};
    Array.prototype.forEach.call(el.children, function (li) { existing[li.dataset.k] = li; });
    rows.forEach(function (row) {
      var k = row[0], li = existing[k];
      if (!li) {
        li = document.createElement('li');
        li.dataset.k = k;
        li.innerHTML = '<span class="name"></span><span class="track"><span class="fill"></span></span><span class="v"></span>';
        li.firstChild.textContent = k;
        li.querySelector('.fill').style.background = color(k);
      }
      delete existing[k];
      li.querySelector('.fill').style.width = (row[1] / max * 100) + '%';
      li.lastChild.textContent = label(row);
      el.appendChild(li);
    });
    Object.keys(existing).forEach(function (k) { existing[k].remove(); });
  }

  var bannerTimer;
  function banner(text) {
    var el = $('banner');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
  }
  var LINE_M = [1e3, 1e4, 5e4, 1e5, 5e5, 1e6, 1e7], COMMIT_M = [100, 500, 1000, 5000, 10000, 50000, 100000];
  function milestone(before) {
    var n = r.index + 1;
    if (n === 1) return DATA.baseline.length ? null : '🌱 first commit';
    var hit = LINE_M.filter(function (m) { return before < m && r.totalLines >= m; }).pop();
    if (hit) return '🎉 ' + fmt(hit) + ' lines of code!';
    if (COMMIT_M.indexOf(n) >= 0) return '🚀 commit #' + fmt(n);
    return null;
  }

  function render() {
    var c = commits[r.index];
    $('s-commits').textContent = fmt(r.index + 1);
    $('s-lines').textContent = fmt(r.totalLines);
    $('s-files').textContent = fmt(r.files.size);
    $('s-authors').textContent = fmt(r.authors.size);
    var av = $('avatar');
    av.textContent = (c.author.trim()[0] || '?').toUpperCase();
    av.style.background = authorColor(c.author);
    $('author').textContent = c.author;
    $('when').textContent = fmtDate(c.time, true);
    $('hash').textContent = c.hash;
    $('subject').textContent = c.subject;

    var created = new Set(c.created), deleted = new Set(c.deleted);
    var files = c.files.slice().sort(function (a, b) { return (b.added + b.deleted) - (a.added + a.deleted); });
    var fmax = Math.max.apply(null, [1].concat(files.map(function (f) { return f.added + f.deleted; })));
    var LIMIT = 14;
    $('files').innerHTML = files.slice(0, LIMIT).map(function (f) {
      var mark = created.has(f.path) ? ['+', 'add'] : deleted.has(f.path) ? ['✕', 'del'] : f.from ? ['→', ''] : ['~', ''];
      var label = f.from ? f.from + ' → ' + f.path : f.path;
      var w = (f.added + f.deleted) / fmax * 100;
      var g = f.added + f.deleted ? f.added / (f.added + f.deleted) * w : 0;
      return '<li><span class="mark ' + mark[1] + '">' + mark[0] + '</span>' +
        '<span class="path mono" title="' + esc(label) + '"><bdi>' + esc(label) + '</bdi></span>' +
        '<span class="diff"><i style="width:' + g + '%;background:var(--add)"></i><i style="width:' + (w - g) + '%;background:var(--del)"></i></span>' +
        (f.binary ? '<span class="n sub">binary</span>' : '<span class="n"><span class="add">+' + fmt(f.added) + '</span> <span class="del">−' + fmt(f.deleted) + '</span></span>') +
        '</li>';
    }).join('') + (files.length > LIMIT ? '<li class="more">… and ' + fmt(files.length - LIMIT) + ' more files</li>' : '');

    var dirs = r.topDirs(8);
    keyedBars($('dirs'), dirs, dirs.length ? dirs[0][1] : 1, function () { return 'var(--dir)'; }, function (d) { return fmt(d[1]); });
    var authors = r.topAuthors(8).map(function (a) { return [a[0], a[1].commits]; });
    keyedBars($('authors'), authors, authors.length ? authors[0][1] : 1, authorColor, function (a) { return fmt(a[1]) + (a[1] === 1 ? ' commit' : ' commits'); });

    var pos = col(c.time, B);
    for (var i = 0; i < rects.length; i++) rects[i].style.fill = i <= pos ? 'var(--accent)' : 'var(--line)';
    $('scrub').value = r.index;
  }

  var playing = true, acc = 0, last = 0;
  var base = Math.min(600, Math.max(5, 40000 / N));
  function setPlaying(on) {
    if (on && r.index >= N - 1) r.seek(-1);
    playing = on;
    $('play').textContent = playing ? '❚❚' : '▶';
  }
  function step() {
    var before = r.totalLines;
    r.seek(r.index + 1);
    var m = milestone(before);
    if (m) banner(m);
  }
  function frame(ts) {
    var dt = last ? Math.min(100, ts - last) : 0;
    last = ts;
    if (playing) {
      acc += dt * speed;
      var moved = false;
      while (acc >= base && r.index < N - 1) { acc -= base; step(); moved = true; }
      if (r.index >= N - 1) { acc = 0; setPlaying(false); }
      if (moved) render();
    }
    requestAnimationFrame(frame);
  }
  function go(i) { r.seek(Math.max(0, Math.min(N - 1, i))); render(); }

  $('play').onclick = function () { setPlaying(!playing); };
  $('prev').onclick = function () { setPlaying(false); go(r.index - 1); };
  $('next').onclick = function () { setPlaying(false); go(r.index + 1); };
  $('speed').onchange = function (e) { speed = Number(e.target.value); };
  $('scrub').oninput = function (e) { setPlaying(false); go(Number(e.target.value)); };
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' && e.key !== ' ') return;
    var k = e.key, si = SPEEDS.indexOf(speed);
    if (k === ' ') { e.preventDefault(); setPlaying(!playing); }
    else if (k === 'ArrowRight') { setPlaying(false); go(r.index + 1); }
    else if (k === 'ArrowLeft') { setPlaying(false); go(r.index - 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); speed = SPEEDS[Math.min(SPEEDS.length - 1, si + 1)]; $('speed').value = speed; }
    else if (k === 'ArrowDown') { e.preventDefault(); speed = SPEEDS[Math.max(0, si - 1)]; $('speed').value = speed; }
    else if (k === 'Home') go(0);
    else if (k === 'End') { setPlaying(false); go(N - 1); }
  });

  step();
  render();
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>
`;
