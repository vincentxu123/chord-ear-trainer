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

## Adding real-song exercises

- Use the repository-local `$add-real-song` skill in
  `.agents/skills/add-real-song/` for YouTube ingestion, analysis, vocal
  removal, excerpt publication, audit, verification, and commit rules.
- Never hand-edit `public/song-clips/manifest.json`, manually cut excerpts, or
  commit `.recordings/`, source recordings, model caches, or reports.
