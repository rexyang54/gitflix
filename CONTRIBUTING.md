# Contributing

```bash
npm install
npm test          # type-check, build and run the test suite
npm start -- ~/some/repo
```

- Keep runtime dependencies at **zero** — `npx gitflix` should start instantly.
- `src/replay.ts` is embedded into the HTML export via `Replay.toString()`, so it must
  stay self-contained: no runtime imports, no helpers defined outside the class.
- Add a test in `src/gitflix.test.ts` for any parsing or replay change.
