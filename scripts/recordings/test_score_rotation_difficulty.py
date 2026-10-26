import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from score_rotation_difficulty import VERSION, publish_scores, runs


class DifficultyExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.manifest = {'version': 'audio-v1', 'clips': [
            {'id': name, 'file': name + '.mp3', 'artist': 'Artist', 'title': 'Song'}
            for name in ('a', 'b')
        ]}
        self.path = self.root / 'manifest.json'
        self.path.write_text(json.dumps(self.manifest), encoding='utf-8')
        rows = []
        for index, entry in enumerate(self.manifest['clips']):
            audio = self.root / entry['file']
            audio.write_bytes(entry['id'].encode())
            rows.append(dict(id=entry['id'], variant='original', artist='Artist', title='Song',
                             clarity=40 + index * 40, pace=20, complexity=10,
                             sha256=hashlib.sha256(audio.read_bytes()).hexdigest()))
        self.report = dict(complete=True, version=VERSION, excerpts=rows,
                           manifestSha256=hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.output = self.root / 'scores.json'

    def test_song_average_is_shared_by_excerpts(self):
        publish_scores(self.report, self.manifest, self.path, self.output)
        scores = json.loads(self.output.read_text())['entries']
        self.assertEqual(scores['a']['original'], {'clarity': 60, 'pace': 20, 'complexity': 10})
        self.assertEqual(scores['a']['original'], scores['b']['original'])

    def test_changed_audio_is_rejected_before_output(self):
        (self.root / 'a.mp3').write_bytes(b'changed audio')
        with self.assertRaises(AssertionError):
            publish_scores(self.report, self.manifest, self.path, self.output)
        self.assertFalse(self.output.exists())

    def test_missing_variant_record_is_rejected(self):
        self.report['excerpts'].pop()
        with self.assertRaises(AssertionError):
            publish_scores(self.report, self.manifest, self.path, self.output)

    def test_changed_manifest_is_rejected(self):
        self.path.write_text('{}')
        with self.assertRaises(AssertionError):
            publish_scores(self.report, self.manifest, self.path, self.output)

    def test_repeated_chord_slots_do_not_count_as_changes(self):
        c = {'rootPc': 0, 'quality': 'maj'}
        g = {'rootPc': 7, 'quality': 'maj'}
        sequence = runs(dict(chords=[c, c, g], cueTimesSec=[0, 1, 2], durationSec=4))
        self.assertEqual(len(sequence), 2)
        self.assertEqual(sequence[0]['end'], 2)
