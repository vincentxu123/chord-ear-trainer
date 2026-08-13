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
