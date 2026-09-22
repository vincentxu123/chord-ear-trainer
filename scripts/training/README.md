# Local chord-model training pilot

This runs a small BTC fine-tuning experiment on GuitarSet. It does not register
a production detector, publish audio, or change the app's answer keys.
See [the training strategy](../../MODEL_TRAINING_PLAN.md) for why target-song
labels and complete-exercise evaluation are still required.

## First run: September 21, 2026

The 15-epoch local pilot completed successfully on the RTX 3060 Ti. Validation
selected epoch 15. The frozen and selected models were then evaluated on the
same 30 held-out recordings (914.0 scored seconds):

- All 38 label groups: **53.71% → 58.26%** (+4.55 percentage points).
- Supported major/minor/diminished triads only: **74.22% → 74.87%** (+0.65 points).
- Exact major root/quality recall: 82.02% → 81.94% (467.2 seconds).
- Exact minor root/quality recall: 60.61% → 57.38% (155.8 seconds).
- Exact diminished root/quality recall: 31.45% → 58.64% (35.6 seconds).
- OTHER recall: 0.84% → 15.44% (255.4 seconds). No annotated N duration was
  present in this test subset, so it provides no evidence for silence detection.

The improvement across all groups is largely due to OTHER recognition. The
triad gain is modest, and minor recall regressed. **Do not replace the app's
detectors with this checkpoint.** This establishes that local fine-tuning works,
not that it improves the app's target music. The test has been inspected; keep
it as pilot diagnostic data rather than reuse it as a fresh final test when
choosing further changes.

Feature preparation, training, and evaluation took 106.3 seconds after environment
and dataset setup. Epochs took roughly 3.5–4.3 seconds. Peak live tensors reported
by PyTorch occupied 132.5 MiB (not total GPU/driver memory). The selected checkpoint,
including optimizer/resume state, is about 17.4 MiB. There were no cloud/API charges;
local electricity and storage are still used.

Verification: four training regression tests and all 58 app tests passed; the
production build generated the service worker. Checkpoint inspection confirmed
finite weights and changes only in the intended final two blocks and classifier;
early layers remained identical. The Windows lock was captured from this run.

Reproduction identifiers:

- BTC revision: `d436f2f664f5107cd987774279b8ce171846e376`.
- Trainer SHA-256: `ef42a7d6165f95cdb51cf0223a434238744367d40c55b5875ae271645b8980a7`.
- Train/validation data signature: `10f1b38a817cd9327632f5fdb003eac02363df06e2080cf07a7dac7455a23bb9`.
- Full local results: `.recordings/training/runs/guitarset-v1/results.json`.
- Selected local checkpoint: `.recordings/training/runs/guitarset-v1/best.pt`.

## Environment

The first local run uses Windows, Python 3.13.2, an RTX 3060 Ti (8 GB), and
PyTorch 2.11.0 with CUDA 12.8. The existing NVIDIA driver supports this runtime;
installing a separate CUDA toolkit is unnecessary for the PyTorch wheel.
The Python environment and experiment data live in gitignored `.recordings/`.
The first environment install downloads a roughly 2.8 GB PyTorch wheel, plus
dependencies. Allow several GB of free disk space for the installed environment.

From the repository root in PowerShell:

```powershell
python -m venv .recordings/training/venv
.\.recordings\training\venv\Scripts\python.exe -m pip install -r scripts/training/requirements-win-cu128.lock.txt --extra-index-url https://download.pytorch.org/whl/cu128
.\.recordings\training\venv\Scripts\python.exe -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name())"
```

The lock records the actual installed Windows environment, including transitive
dependencies. Other platforms may need different PyTorch/platform wheels; this
is not a universal Linux/Colab lock. Keep the app's recording environment separate.

## Run

```powershell
python scripts/training/prepare_guitarset.py
.\.recordings\training\venv\Scripts\python.exe -m unittest discover -s scripts/training -p "test_*.py"
.\.recordings\training\venv\Scripts\python.exe -u scripts/training/train_btc.py
```

Preparation downloads only the microphone audio and annotations from
[GuitarSet v1.1.0](https://zenodo.org/records/3371780), about 696 MB. It verifies
the release's MD5 checksums, extracts inside the local data directory, and uses
the performed/inferred chord annotations. Source archives, labels, features,
and checkpoints remain untracked. The dataset is CC BY 4.0; retain attribution
to Qingyang Xi, Rachel Bittner, Johan Pauwels, Xuzhou Ye, and Juan Pablo Bello,
“GuitarSet: A Dataset for Guitar Transcription,” ISMIR 2018.

We exclude `04_BN3-154-E_comp` and `04_Jazz1-200-B_comp` before running the
experiment because of [published timing errors](https://github.com/marl/GuitarSet/issues/5).
The remaining microphone comping recordings split into:

- Training: performers 00–03, 120 recordings.
- Validation: performer 04, 28 recordings.
- Test: performer 05, 30 recordings.

All these performers play related compositions. This tests adaptation to a
held-out performer, **not unseen compositions or full-band pop songs**. Original
pretraining overlap is unknown. Inferred labels can still contain errors.

The trainer uses the app's pinned BTC wrapper, preserves the pretrained output
weights, and groups probabilities into major/minor/diminished roots, N, and
OTHER. It freezes early layers and trains the last two attention blocks and
output projection. Maximum 15 epochs, patience 3, batch size 8, seed 42.
The pretrained baseline remains the selected checkpoint if training never
improves validation. Raw audio features and the label policy are identical for
the frozen and fine-tuned comparisons.

## Outputs and interruption recovery

Default run directory: `.recordings/training/runs/guitarset-v1/`.

- `last.pt`: latest weights, optimizer, RNG state, and progress for resuming.
- `best.pt`: checkpoint chosen using validation only; epoch 0 means the baseline.
- `baseline-weights.pt`: the frozen pretrained weights for comparison.
- `history.jsonl`: training/validation scores by epoch.
- `results.json`: final frozen/selected test scores, per-recording results,
  duration confusion matrices, provenance, GPU memory, and timing.
- `validation-example.json`: predicted chord segments for a validation example.
- `environment.txt`, `data-provenance.json`: dependencies and input hashes.

Rerun the same training command after an interrupted session. It checks the
environment and dataset signature before loading `last.pt`; feature caches avoid
repeating expensive CQT extraction. Use `--output` to select a fresh run directory
for a new experiment. `--epochs` sets the total epoch limit, not extra epochs.
Do not increase that limit based on the final test result: that would turn test
data into model-selection feedback. Once a test informs changes, reserve a new
test set before making generalization claims.

Scores are **duration-weighted frame agreement with the dataset labels**, using
our 38 groups. Triad scores use supported-reference duration, with unsupported
predictions counted as wrong. N/unknown/padding cannot silently inflate triad
accuracy. These scores do not measure whole four-measure exercise correctness,
Roman-numeral/key accuracy, or independent human agreement.
