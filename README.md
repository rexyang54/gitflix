<div align="center">

# 🎬 gitflix

**Watch your git history like a movie.**

Every commit, every file, every contributor — replayed in your terminal,
or exported as a single web page you can share anywhere.

```bash
npx gitflix
```

<!-- TODO: record docs/demo.gif with `vhs` and embed it here — it's the most important line of this README. -->

[![npm](https://img.shields.io/npm/v/gitflix?color=e50914)](https://www.npmjs.com/package/gitflix)
![zero dependencies](https://img.shields.io/badge/dependencies-0-success)
![license](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## Why

`git log` tells you *what* happened. **gitflix shows you how a codebase grew** — which
directories exploded, who carried the project through which era, the week someone
deleted 40,000 lines. It turns a repository into a story you can scrub through.

- ⚡ **One command, zero config, zero dependencies.** Point it at any repo.
- 🖥️ **A real TUI player.** Play, pause, step, scrub and speed up to 128×.
- 🌐 **Shareable HTML.** `--html` writes one self-contained file — drop it on GitHub Pages, Netlify or a gist.
- 🎉 **Milestones.** First commit, 10,000 lines, commit #1,000 — celebrated as they happen.
- 🧮 **Accurate.** Follows renames and deletions; partial replays (`--max`, ranges) start from the real codebase, not from zero.
- 🌏 **Unicode-aware.** CJK and emoji in commit messages and names keep the layout intact.

## Usage

```bash
npx gitflix                          # replay the current repo
npx gitflix ~/code/my-app            # any repo on disk
npx gitflix --max 500                # just the last 500 commits
npx gitflix --rev v1.0..v2.0         # a release, a branch, any range
npx gitflix --path src/              # only commits touching src/
npx gitflix --html replay.html       # export a shareable web page
npx gitflix --summary                # print stats and exit
```

| Key | Action |
| --- | --- |
| `space` | play / pause |
| `←` `→` | step one commit |
| `[` `]` | jump 10% |
| `↑` `↓` | speed |
| `g` `G` | start / end |
| `q` | quit |

## Share your repo's movie

```bash
npx gitflix --html index.html
```

Commit `index.html` to a `gh-pages` branch, and your project's whole history is one link away.
Got a cool one? Post it in [Show and tell](../../discussions) — we'd love to see it.

## Use as a library

```ts
import { readHistory, Replay } from 'gitflix';

const commits = readHistory({ cwd: '.' });
const replay = new Replay(commits);
replay.seek(commits.length - 1);
console.log(replay.totalLines, replay.topDirs(5));
```

## How it works

gitflix reads `git log --numstat --summary` once, then rebuilds the codebase one commit
at a time: line counts per file, directory totals, and author stats. The same `Replay`
engine powers the terminal player and is embedded verbatim in the exported HTML, so both
always agree.

## Roadmap

- [ ] `--gif` / `--mp4` export
- [ ] Per-language breakdown
- [ ] Treemap view in the HTML player
- [ ] Remote repos: `npx gitflix github.com/user/repo`

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
