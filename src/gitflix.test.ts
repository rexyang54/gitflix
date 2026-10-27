import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { parseLog, parseRename, readBaseline, readHistory, repoName } from './git.js';
import { Replay } from './replay.js';
import { renderHtml } from './html.js';
import { fit, strWidth, truncate, truncateLeft } from './term.js';

const RS = '\x1e';
const US = '\x1f';
const rec = (hash: string, author: string, at: number, subject: string, body: string) =>
  `${RS}${hash}${US}${author}${US}${at}${US}${subject}\n\n${body}`;

const LOG = [
  rec('a'.repeat(40), 'Ada', 1_700_000_000, 'init', '10\t0\tREADME.md\n20\t0\tsrc/main.ts\n create mode 100644 README.md\n create mode 100644 src/main.ts\n'),
  rec('b'.repeat(40), 'Linus', 1_700_100_000, 'move main', '2\t1\tsrc/{main.ts => app.ts}\n-\t-\tlogo.png\n rename src/{main.ts => app.ts} (90%)\n create mode 100644 logo.png\n'),
  rec('c'.repeat(40), '김개발', 1_700_200_000, '불필요한 파일 삭제', '0\t10\tREADME.md\n delete mode 100644 README.md\n'),
].join('');

test('parseRename handles every notation', () => {
  assert.deepEqual(parseRename('a.ts => b.ts'), { from: 'a.ts', to: 'b.ts' });
  assert.deepEqual(parseRename('src/{a => b}/x.ts'), { from: 'src/a/x.ts', to: 'src/b/x.ts' });
  assert.deepEqual(parseRename('{ => lib}/x.ts'), { from: 'x.ts', to: 'lib/x.ts' });
  assert.deepEqual(parseRename('src/{old => }/x.ts'), { from: 'src/old/x.ts', to: 'src/x.ts' });
  assert.equal(parseRename('plain.ts'), null);
});

test('parseLog reads stats, renames, binaries, creates and deletes', () => {
  const [a, b, c] = parseLog(LOG);
  assert.equal(a.author, 'Ada');
  assert.equal(a.time, 1_700_000_000_000);
  assert.deepEqual(a.created, ['README.md', 'src/main.ts']);
  assert.deepEqual(b.files[0], { path: 'src/app.ts', from: 'src/main.ts', added: 2, deleted: 1 });
  assert.deepEqual(b.files[1], { path: 'logo.png', added: 0, deleted: 0, binary: true });
  assert.equal(c.subject, '불필요한 파일 삭제');
  assert.deepEqual(c.deleted, ['README.md']);
});

test('Replay tracks lines through renames and deletes', () => {
  const r = new Replay(parseLog(LOG));
  r.seek(0);
  assert.equal(r.totalLines, 30);
  assert.deepEqual(r.topDirs(5), [['src/', 20], ['/', 10]]);
  r.seek(1);
  assert.equal(r.files.get('src/main.ts'), undefined);
  assert.equal(r.files.get('src/app.ts'), 21);
  assert.equal(r.files.get('logo.png'), 0);
  r.seek(2);
  assert.equal(r.totalLines, 21);
  assert.equal(r.files.has('README.md'), false);
  assert.equal(r.authors.size, 3);
});

test('Replay seeking backwards matches a fresh replay', () => {
  const commits = parseLog(LOG);
  const r = new Replay(commits);
  r.seek(2);
  r.seek(0);
  const fresh = new Replay(commits);
  fresh.seek(0);
  assert.deepEqual([...r.files], [...fresh.files]);
  assert.equal(r.totalLines, fresh.totalLines);
});

test('terminal width helpers count wide characters', () => {
  assert.equal(strWidth('abc'), 3);
  assert.equal(strWidth('한글'), 4);
  assert.equal(strWidth('🎉'), 2);
  assert.equal(truncate('안녕하세요', 5), '안녕…');
  assert.equal(truncateLeft('src/very/long/path.ts', 8), '…path.ts');
  assert.equal(strWidth(fit([['한글 커밋 메시지', '1']], 10, false)), 10);
});

test('renderHtml escapes data and embeds a working Replay', () => {
  const commits = parseLog(LOG);
  commits[0].subject = '</script><img onerror=alert(1)>';
  const html = renderHtml(commits, '<repo>');
  assert.ok(!html.includes('</script><img'));
  assert.ok(html.includes('<title>&lt;repo&gt; · gitflix</title>'));

  // Run the embedded Replay against the embedded data in a sandbox.
  const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('(function () {'));
  const ctx = vm.createContext({});
  vm.runInContext(script + ';globalThis.R = Replay; globalThis.D = DATA;', ctx);
  assert.equal(ctx.D.commits.length, 3);
  assert.equal(typeof ctx.R, 'function');
});

test('readHistory reads a real repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gitflix-'));
  try {
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=Tester', '-c', 'user.email=t@example.com', ...args], { cwd: dir });
    git('init', '-q');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), 'one\ntwo\nthree\n');
    git('add', '.');
    git('commit', '-qm', 'first');
    git('mv', 'src/a.ts', 'src/b.ts');
    git('commit', '-qm', 'rename');
    const commits = readHistory({ cwd: dir });
    assert.equal(commits.length, 2);
    assert.equal(commits[1].files[0].from, 'src/a.ts');
    const r = new Replay(commits);
    r.seek(1);
    assert.deepEqual([...r.files], [['src/b.ts', 3]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readBaseline seeds a partial replay with the earlier codebase', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gitflix-'));
  try {
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=Tester', '-c', 'user.email=t@example.com', ...args], { cwd: dir });
    git('init', '-q');
    writeFileSync(join(dir, 'a.txt'), '1\n2\n3\n4\n');
    git('add', '.');
    git('commit', '-qm', 'old');
    writeFileSync(join(dir, 'b.txt'), '1\n');
    git('add', '.');
    git('commit', '-qm', 'new');
    const opts = { cwd: dir, max: 1 };
    const commits = readHistory(opts);
    const baseline = readBaseline(opts, commits[0]);
    assert.deepEqual(baseline, [['a.txt', 4]]);
    const r = new Replay(commits, baseline);
    r.seek(0);
    assert.equal(r.totalLines, 5);
    assert.deepEqual(readBaseline({ cwd: dir }, readHistory({ cwd: dir })[0]), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repoName explains common mistakes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gitflix-'));
  try {
    assert.throws(() => repoName(join(dir, 'missing')), /no such directory/);
    assert.throws(() => repoName(dir), /is not a git repository[\s\S]*npx gitflix/);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    assert.throws(() => repoName(dir), /has no commits yet/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
