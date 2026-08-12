# Repository instructions

## Adding real-song exercises

- Use the automated recording pipeline; do not hand-edit
  `public/song-clips/manifest.json` or manually cut excerpts.
- Keep source recordings outside tracked directories and pass an absolute path:

  ```bash
  npm run songs:process -- \
    --audio "/absolute/path/to/song.mp3" \
    --artist "Jay Chou" \
    --title "Chinese title / Romanized title"
  ```

- The one-time Python/FFmpeg setup is documented in `README.md` and
  `scripts/recordings/README.md`. Use `--device mps` on a compatible Mac when
  appropriate; CPU is the default.
- Let key/mode be estimated unless there is evidence they are wrong. An override
  must provide both `--key` and `--mode`. Add `--reuse-analysis` when rerunning
  cached inference after an override or pipeline-code change.
- Publication is intentionally automatic. A window is exported only when its
  structural timing/harmony gates pass and both chord models agree on every
  ordered chord sequence. Do not introduce a human-approval gate.
- After processing, inspect
  `.recordings/<artist-title-slug>/publish-report.html` as an audit. It shows all
  included/excluded windows and exclusion reasons, but inspection is not a
  prerequisite for export.
- `songs:process` replaces entries matching the same artist/title and preserves
  other songs. `npm run songs:export` rebuilds the entire exported library from
  all cached `.recordings/*/analysis.json` files, so use it only when that scope
  is intended.
- Difficulty is derived by the app from unique chords: Easy is up to 3, Medium
  is 4–5, and Hard is 6+. Do not add difficulty fields to the manifest.
- Run `npm test` and `npm run build` after processing. Commit only the intended
  `public/song-clips/*.mp3` files and `public/song-clips/manifest.json`.
- Never commit `.recordings/`, `.venv-recordings/`, source recordings, model
  caches, or reports. Do not distribute commercial audio without the necessary
  rights.
