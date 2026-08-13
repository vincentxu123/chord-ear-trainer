# Repository instructions

## Maintaining project TODOs

- Before finishing any project change, review the `Project TODOs` section in
  `README.md` and update it when the work adds, completes, removes, or changes
  the scope of a TODO.

## Git workflow

- Commit and push changes directly to `master` by default. Do not create or use
  another branch unless the user explicitly requests one.

## UI design

- Prefer simple, minimal interfaces whose controls and visual hierarchy make
  the next action clear without explanatory help text. Use familiar icons for
  compact actions when their meaning remains clear, and always provide an
  accessible label.
- Default to concise labels instead of subtitles, descriptions, or help text.
  First make the control and surrounding layout self-explanatory; add supporting
  copy only when the interaction would otherwise remain genuinely ambiguous.

## Online web app and PWA

The production build is both the website and the installable PWA. There is no
separate PWA codebase. Any product change must keep **online browser use** and
**installed / offline use** working.

- Online: Piano, Generated, and Real Music work in a normal browser tab with no
  install step and no **Download** tap. Real Music fetches `manifest.json` and
  audio from the network.
- Offline after install: the app shell, piano engine, and
  `public/piano-samples/` load from the service worker. Piano, chord preview,
  and the on-screen keyboard must not depend on `tonejs.github.io` or any other
  CDN. Real Music stays an explicit pack: only excerpts already saved with
  **Download** may play; do not fall back to a piano round.
- Keep that split in `vite.config.ts`. Precache the shell and
  `piano-samples/*.mp3` only. Do not add `song-clips/` (or `clips/`) to
  `globPatterns` — those libraries grow independently of the app revision.
- Song playback URLs must keep the `?library=<manifest.version>` query so a
  changed MP3 cannot reuse a stale cache entry. `SONG_CACHE_NAME` and the
  metadata cache name must stay identical in `vite.config.ts` and
  `src/store/songs.ts`.
- Adding Real Music through the song pipeline does not require PWA code
  changes. `songs:process` / `songs:youtube` rewrite `manifest.json` (including
  `version` and `totalBytes`) and publish original plus instrumental files.
  Online users pick up the new list on the next load; anyone with an offline
  pack uses **Finish download** / **Download** to refresh it. Raise Workbox
  `maxEntries` (currently 500 files, typically two per excerpt) only if the
  published library would exceed that cap.
- After app or audio-pipeline changes, run `npm test` and `npm run build`. The
  build emits the service worker; a TypeScript-only check is not enough to
  confirm PWA packaging.

## Adding real-song exercises

- Use the repository-local `$add-real-song` skill in
  `.agents/skills/add-real-song/` for YouTube ingestion, analysis, vocal
  removal, excerpt publication, audit, verification, and commit rules.
- Prepare a fresh clone with `npm run songs:setup`, then verify it with
  `npm run songs:doctor`. Setup requires Python 3.11+ and FFmpeg and creates the
  gitignored `.venv-recordings` environment.
- Repository song commands select the virtualenv automatically. For direct
  Python work, activate it with `source .venv-recordings/bin/activate` on macOS
  or Linux, or `.venv-recordings\Scripts\activate` on Windows. Run `deactivate`
  when finished.
- Model weights are intentionally not committed. Beat This, BTC, and Demucs
  download them into local user caches on first use; keep those caches outside
  Git.
- Never hand-edit `public/song-clips/manifest.json`, manually cut excerpts, or
  commit `.recordings/`, source recordings, model caches, or reports.
