import type { AttemptResult } from './engine/round';
import { toAbsoluteChord, toRoman } from './theory/chords';
import type { Chord, Exercise } from './theory/types';

const NEW_ISSUE_URL =
  'https://github.com/vincentxu123/chord-ear-trainer/issues/new';

function formatProgression(
  chords: (Chord | null)[],
  exercise: Exercise,
): string {
  return chords
    .map((chord) =>
      chord
        ? `${toRoman(chord, exercise.mode)} (${toAbsoluteChord(chord, exercise.key)})`
        : '—',
    )
    .join(' – ');
}

export function buildWrongAnswerIssueUrl(
  exercise: Exercise,
  answers: (Chord | null)[],
  result: AttemptResult,
  pageUrl: string,
): string {
  if (!exercise.song || !exercise.media) {
    throw new Error('Wrong-answer reports require a real-song exercise');
  }

  const song = exercise.song;
  const title = `Wrong answer: ${song.artist} – ${song.title}, measures ${song.startMeasure}–${song.endMeasure}`;
  const cues = exercise.media.cueTimesSec?.map((cue) => cue.toFixed(3)).join(', ') ?? 'n/a';
  const body = [
    '## Exercise',
    '',
    `- Song: ${song.artist} – ${song.title}`,
    `- Measures: ${song.startMeasure}–${song.endMeasure}`,
    `- Clip ID: \`${exercise.progression.id}\``,
    `- Key/mode: ${exercise.key} ${exercise.mode}`,
    `- Measure chord counts: ${song.measureChordCounts.join(', ')}`,
    `- Cue times (seconds): ${cues}`,
    '',
    '## Answers',
    '',
    `- Current answer key: ${formatProgression(exercise.progression.chords, exercise)}`,
    `- My submitted answer: ${formatProgression(answers, exercise)}`,
    `- Score: ${result.correctCount}/${result.total}`,
    '',
    '## Notes',
    '',
    '<!-- Add anything else you heard here. -->',
    '',
    `App page: ${pageUrl}`,
  ].join('\n');

  const query = new URLSearchParams({ title, body });
  return `${NEW_ISSUE_URL}?${query.toString()}`;
}
