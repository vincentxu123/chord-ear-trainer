import unittest

import numpy as np

from train_btc import frame_times, label_id, validate_rows, weighted_confusion


class TrainingTests(unittest.TestCase):
    def test_suspension_and_augmented_are_not_major(self):
        for chord in ("C:sus4", "C:sus2", "C:aug", "C:5"):
            self.assertEqual(label_id(chord), 37)
        self.assertEqual(label_id("C:7"), 0)
        self.assertEqual(label_id("C:maj/3"), 0)
        self.assertEqual(label_id("A:min7"), 28)
        self.assertEqual(label_id("B:hdim7"), 35)
        self.assertEqual(label_id("X"), -100)
        self.assertEqual(label_id("N"), 36)

    def test_timestamps_reset_at_each_cqt_block_without_drift(self):
        times = frame_times(325)
        self.assertEqual(times[108], 10)
        self.assertEqual(times[324], 30)
        self.assertAlmostEqual(times[107], 107 * 2048 / 22050)
        self.assertTrue(np.all(np.diff(times) > 0))

    def test_padding_and_unknown_do_not_inflate_score(self):
        matrix = weighted_confusion(np.array([0, 0, -100, 36]),
                                    np.array([0, 1, 0, 36]),
                                    np.array([1.0, 2.0, 3.0, 0.0]))
        self.assertEqual(matrix.sum(), 3)
        self.assertEqual(matrix.trace(), 1)

    def test_group_leakage_fails_before_training(self):
        rows = [dict(id="a", group="song-a", split="train"),
                dict(id="b", group="song-b", split="val"),
                dict(id="c", group="song-c", split="test")]
        validate_rows(rows)
        rows[2]["group"] = "song-a"
        with self.assertRaises(ValueError):
            validate_rows(rows)


if __name__ == "__main__":
    unittest.main()
