"""Local BTC fine-tuning pilot. Never publishes audio or changes production detectors."""
from pathlib import Path
import hashlib
import json
import random
import subprocess
import sys
import numpy as np
import torch
import torch.nn.functional as F
import librosa
import mir_eval
from torch.utils.data import DataLoader, TensorDataset
from transformers import AutoModel


import argparse
import time

ROOT = Path(__file__).resolve().parents[2] / ".recordings" / "training"


def label_id(label):
    """Reduce pitch content conservatively; unknown labels carry no target."""
    if label == "N":
        return 36
    if label == "X":
        return -100
    root, bitmap, _bass = mir_eval.chord.encode(label)
    triads = [(0, 4, 7), (0, 3, 7), (0, 3, 6)]
    matches = [q for q, triad in enumerate(triads)
               if all(bitmap[p] == 1 for p in triad)]
    return 3 * int(root) + matches[0] if root >= 0 and len(matches) == 1 else 37


def validate_rows(rows):
    if not rows or len({r["id"] for r in rows}) != len(rows):
        raise ValueError("Dataset must contain unique recording IDs")
    groups = {}
    for row in rows:
        if row["split"] not in {"train", "val", "test"}:
            raise ValueError("Unknown split")
        if groups.setdefault(row["group"], row["split"]) != row["split"]:
            raise ValueError("A recording group crosses splits")
    if {r["split"] for r in rows} != {"train", "val", "test"}:
        raise ValueError("All three splits are required")


def frame_times(count):
    frames = np.arange(count)
    return (frames // 108) * 10.0 + (frames % 108) * (2048 / 22050)


def weighted_confusion(truth, prediction, duration):
    valid = (truth >= 0) & (duration > 0)
    matrix = np.zeros((38, 38), dtype=float)
    np.add.at(matrix, (truth[valid], prediction[valid]), duration[valid])
    return matrix


def main():

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cuda")
    parser.add_argument("--output", type=Path, default=ROOT / "runs" / "guitarset-v1")
    args = parser.parse_args()
    if args.epochs < 1:
        parser.error("epochs must be positive")
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    torch.set_num_threads(4)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(42)
    device = args.device
    if device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; check the PyTorch installation")
    OUT = args.output.resolve()
    OUT.mkdir(parents=True, exist_ok=True)
    rows = json.loads((ROOT / "guitarset" / "index.json").read_text(encoding="utf-8"))
    validate_rows(rows)
    hardware = dict(python=sys.version, torch=torch.__version__, device=device,
                    gpu=torch.cuda.get_device_name() if device == "cuda" else None)
    print(json.dumps(hardware), flush=True)
    environment = subprocess.check_output([sys.executable, "-m", "pip", "freeze"], text=True)
    environment_path = OUT / "environment.txt"
    if (OUT / "last.pt").exists() and environment_path.read_text(encoding="utf-8") != environment:
        raise ValueError("Environment changed; use a new output directory")
    environment_path.write_text(environment, encoding="utf-8")
    started = time.monotonic()

    REV = "d436f2f664f5107cd987774279b8ce171846e376"
    print("Loading pinned BTC checkpoint...", flush=True)
    wrapper = AutoModel.from_pretrained(
        "puar-playground/btc-chord", revision=REV,
        trust_remote_code=True, device=device,
    )
    model = wrapper.model
    from btc_src.features import audio_to_features

    names = [f"{root}:{quality}" for root in
             ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
             for quality in ("maj", "min", "dim")] + ["N", "OTHER"]

    assert label_id("C:7") == label_id("C:maj") == 0
    assert label_id("A:min7") == 28
    assert label_id("B:hdim7") == 35
    assert label_id("C:sus4") == label_id("C:aug") == 37

    mapping = [label_id(wrapper._idx_to_chord[i]) for i in range(170)]
    mapping = [37 if i == -100 else i for i in mapping]
    groups = [torch.tensor([i for i, g in enumerate(mapping) if g == target],
                           device=device) for target in range(38)]
    assert all(len(g) for g in groups)

    def grouped_logits(x):
        hidden, _ = model.self_attn_layers(x)
        logits = model.output_layer.output_projection(hidden)
        # Softmax of these logits equals the sum of the original probabilities.
        return torch.stack([torch.logsumexp(logits.index_select(-1, g), dim=-1)
                            for g in groups], dim=-1)

    def file_hash(path):
        digest = hashlib.sha256()
        with open(path, "rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    CACHE = ROOT / "features"
    CACHE.mkdir(exist_ok=True)
    FEATURE_VERSION = "btc-block-cqt-physical-times-v1"

    def make_features(audio):
        wave, _ = librosa.load(str(audio), sr=22050, mono=True)
        duration = len(wave) / 22050
        if duration <= 0:
            raise ValueError("Empty audio")
        x = audio_to_features(wave).T
        mean = np.asarray(wrapper._mean)
        std = np.asarray(wrapper._std)
        assert np.all(std > 0)
        x = ((x - mean) / std).astype(np.float32)
        times = frame_times(len(x))
        keep = times < duration
        return x[keep], times[keep], duration

    def prepare(row):
        provenance = dict(audio=file_hash(row["audio"]), lab=file_hash(row["lab"]),
                          revision=REV, features=FEATURE_VERSION, labels="triad38-v1")
        key = hashlib.sha256(json.dumps(provenance, sort_keys=True).encode()).hexdigest()
        path = CACHE / f"{key}.npz"
        if not path.exists():
            x, starts, duration = make_features(row["audio"])
            ends = np.r_[starts[1:], duration]
            centers = (starts + ends) / 2
            y = np.full(len(x), -100, dtype=np.int64)
            intervals, labels = mir_eval.io.load_labeled_intervals(row["lab"])
            if len(intervals) == 0 or np.any(intervals[:, 1] <= intervals[:, 0]):
                raise ValueError(f"Invalid intervals: {row['id']}")
            if np.any(intervals[1:, 0] < intervals[:-1, 1] - 1e-6):
                raise ValueError(f"Overlapping/unsorted labels: {row['id']}")
            if intervals[0, 0] < 0 or intervals[-1, 1] > duration + 0.1:
                raise ValueError(f"Annotation/audio duration mismatch: {row['id']}")
            for (a, b), label in zip(intervals, labels):
                y[(centers >= a) & (centers < b)] = label_id(label)
            weights = (ends - starts).astype(np.float32)
            weights[y == -100] = 0
            if not np.isfinite(x).all() or weights.sum() <= 0:
                raise ValueError(f"Invalid/unlabeled example: {row['id']}")
            pad = (-len(x)) % 108
            np.savez_compressed(path,
                x=np.pad(x, ((0, pad), (0, 0))).reshape(-1, 108, 144),
                y=np.pad(y, (0, pad), constant_values=-100).reshape(-1, 108),
                w=np.pad(weights, (0, pad)).reshape(-1, 108))
        return path, provenance

    prepared = []
    for number, row in enumerate(rows):
        if number % 10 == 0:
            print(f"Preparing {number}/{len(rows)} recordings", flush=True)
        # Keep the locked test audio out of the training/selection stage.
        if row["split"] == "test":
            continue
        path, provenance = prepare(row)
        prepared.append((row, path, provenance))
    data_signature = hashlib.sha256(json.dumps(
        [(r["id"], r["group"], r["split"], p) for r, _, p in prepared],
        sort_keys=True).encode()).hexdigest()
    (OUT / "data-provenance.json").write_text(json.dumps(
        [dict(id=r["id"], split=r["split"], **p) for r, _, p in prepared], indent=2))

    def loader(split):
        arrays = []
        for row, path, _ in prepared:
            if row["split"] == split:
                with np.load(path) as item:
                    arrays.append(tuple(item[k].copy() for k in ("x", "y", "w")))
        if not arrays:
            raise ValueError(f"Empty {split} split")
        tensors = [torch.from_numpy(np.concatenate([a[i] for a in arrays]))
                   for i in range(3)]
        valid = tensors[2].sum(dim=1) > 0
        if not valid.any():
            raise ValueError(f"No usable labels in {split}")
        return DataLoader(TensorDataset(*(t[valid] for t in tensors)),
                          batch_size=8, shuffle=(split == "train"), num_workers=0)

    train_loader, val_loader = loader("train"), loader("val")

    for parameter in model.parameters():
        parameter.requires_grad = False
    tail = model.self_attn_layers.self_attn_layers[-2:]
    head = model.output_layer.output_projection
    for module in (tail, head):
        for parameter in module.parameters():
            parameter.requires_grad = True
    optimizer = torch.optim.AdamW([
        {"params": tail.parameters(), "lr": 1e-5},
        {"params": head.parameters(), "lr": 5e-5},
    ], weight_decay=1e-4)
    parameters = [p for p in model.parameters() if p.requires_grad]

    def run_epoch(batches, training=False):
        # Early frozen layers stay deterministic; train dropout only in the tail.
        model.eval()
        tail.train(training)
        loss_sum = correct = seconds = 0.0
        with torch.set_grad_enabled(training):
            for x, y, w in batches:
                x, y, w = x.to(device), y.to(device), w.to(device)
                logits = grouped_logits(x)
                losses = F.cross_entropy(logits.transpose(1, 2), y,
                                         ignore_index=-100, reduction="none")
                denominator = w.sum()
                if denominator <= 0:
                    continue
                loss = (losses * w).sum() / denominator
                if training:
                    optimizer.zero_grad(set_to_none=True)
                    loss.backward()
                    torch.nn.utils.clip_grad_norm_(parameters, 1.0)
                    optimizer.step()
                loss_sum += float((losses.detach() * w).sum())
                correct += float(((logits.argmax(-1) == y) * w).sum())
                seconds += float(denominator)
        if seconds == 0:
            raise ValueError("No scored duration")
        return loss_sum / seconds, correct / seconds

    def save_checkpoint(path, epoch, best, stale):
        state = dict(model=model.state_dict(), optimizer=optimizer.state_dict(),
                     epoch=epoch, best=best, stale=stale, revision=REV,
                     data_signature=data_signature, labels=names,
                     feature_version=FEATURE_VERSION, epochs_requested=args.epochs,
                     mean=np.asarray(wrapper._mean).tolist(),
                     std=np.asarray(wrapper._std).tolist(),
                     torch_rng=torch.get_rng_state(),
                     cuda_rng=torch.cuda.get_rng_state_all() if device == "cuda" else [],
                     numpy_rng=np.random.get_state(), python_rng=random.getstate())
        temporary = path.with_suffix(".tmp")
        torch.save(state, temporary)
        temporary.replace(path)

    last, best_path = OUT / "last.pt", OUT / "best.pt"
    torch.save(model.state_dict(), OUT / "baseline-weights.pt")
    if last.exists():
        # weights_only=False is needed for our own RNG/optimizer state.
        # Load only checkpoints created by this notebook or another trusted source.
        state = torch.load(last, map_location="cpu", weights_only=False)
        assert state["revision"] == REV and state["data_signature"] == data_signature
        assert state["labels"] == names and state["feature_version"] == FEATURE_VERSION
        model.load_state_dict(state["model"])
        optimizer.load_state_dict(state["optimizer"])
        torch.set_rng_state(state["torch_rng"])
        if device == "cuda" and state["cuda_rng"]:
            torch.cuda.set_rng_state_all(state["cuda_rng"])
        np.random.set_state(state["numpy_rng"])
        random.setstate(state["python_rng"])
        start, best, stale = state["epoch"] + 1, state["best"], state["stale"]
    else:
        baseline_loss, best = run_epoch(val_loader)
        print("Frozen baseline:", baseline_loss, best, flush=True)
        start, stale = 0, 0
        save_checkpoint(best_path, -1, best, stale)
        save_checkpoint(last, -1, best, stale)

    for epoch in range(start, args.epochs):
        epoch_started = time.monotonic()
        if stale >= 3:
            break
        train_loss, train_score = run_epoch(train_loader, training=True)
        val_loss, val_score = run_epoch(val_loader)
        print(epoch + 1, "train", train_loss, train_score, "val", val_loss, val_score, "seconds", round(time.monotonic() - epoch_started, 1), flush=True)
        improved = val_score > best
        stale = 0 if improved else stale + 1
        if improved:
            best = val_score
            save_checkpoint(best_path, epoch, best, stale)
        save_checkpoint(last, epoch, best, stale)
        with (OUT / "history.jsonl").open("a") as log:
            log.write(json.dumps(dict(epoch=epoch, train_loss=train_loss,
                                     train_score=train_score, val_loss=val_loss,
                                     val_score=val_score)) + "\n")

    state = torch.load(best_path, map_location="cpu", weights_only=False)
    model.load_state_dict(state["model"])
    model.eval()

    def predict_segments(audio):
        x, times, duration = make_features(audio)
        valid_count = len(x)
        x = np.pad(x, ((0, (-valid_count) % 108), (0, 0)))
        predictions = []
        with torch.no_grad():
            for block in x.reshape(-1, 108, 144):
                tensor = torch.from_numpy(block).unsqueeze(0).to(device)
                predictions.extend(grouped_logits(tensor).argmax(-1)[0].cpu().tolist())
        predictions = predictions[:valid_count]
        starts = [0] + [i for i in range(1, valid_count)
                        if predictions[i] != predictions[i - 1]]
        segments = []
        for start, end in zip(starts, starts[1:] + [valid_count]):
            label = names[predictions[start]]
            segments.append(dict(start_time=float(times[start]),
                                 end_time=float(times[end]) if end < valid_count else duration,
                                 chord="X" if label == "OTHER" else label))
        return segments

    example = next(r for r in rows if r["split"] == "val")
    prediction = predict_segments(example["audio"])
    (OUT / "validation-example.json").write_text(json.dumps(prediction, indent=2))
    print(prediction[:8])


    # Evaluate the fixed held-out performer only AFTER validation selects weights.
    print("Evaluating frozen and selected models on held-out performer 05...", flush=True)
    test_rows = [r for r in rows if r["split"] == "test"]
    test_inputs = []
    for row in test_rows:
        path, provenance = prepare(row)
        with np.load(path) as item:
            test_inputs.append((row, tuple(torch.from_numpy(item[k].copy()) for k in ("x", "y", "w")), provenance))

    def evaluate_test(weights):
        model.load_state_dict(weights)
        model.eval()
        confusion = np.zeros((38, 38), dtype=float)
        tracks = []
        with torch.no_grad():
            for row, (x, y, w), provenance in test_inputs:
                logits = grouped_logits(x.to(device))
                prediction = logits.argmax(-1).cpu().numpy()
                truth, duration = y.numpy(), w.numpy()
                matrix = weighted_confusion(truth, prediction, duration)
                confusion += matrix
                tracks.append(dict(id=row["id"], group=row["group"],
                                   seconds=float(matrix.sum()), correct_seconds=float(matrix.trace()),
                                   score=float(matrix.trace() / matrix.sum()), provenance=provenance))
        harmonic = float(confusion[:36].sum())
        return dict(score=float(confusion.trace() / confusion.sum()),
                    triad_score=float(np.trace(confusion[:36, :36]) / harmonic) if harmonic else None,
                    seconds=float(confusion.sum()), tracks=tracks,
                    confusion_seconds=confusion.tolist())

    baseline = evaluate_test(torch.load(OUT / "baseline-weights.pt", map_location="cpu", weights_only=True))
    selected = torch.load(best_path, map_location="cpu", weights_only=False)
    adapted = evaluate_test(selected["model"])
    results = dict(dataset="GuitarSet-1.1.0 comping microphone", split="performer 00-03 train, 04 validation, 05 test",
                   limitation="Shared compositions; one held-out performer; not evidence of pop-song or complete-exercise accuracy.",
                   hardware=hardware, model_revision=REV, feature_version=FEATURE_VERSION,
                   data_signature=data_signature, labels=names, selected_epoch=selected["epoch"] + 1,
                   best_validation_score=selected["best"], baseline=baseline, adapted=adapted,
                   change_percentage_points=100 * (adapted["score"] - baseline["score"]),
                   elapsed_seconds=time.monotonic() - started,
                   peak_gpu_bytes=torch.cuda.max_memory_allocated() if device == "cuda" else None,
                   trainer_sha256=file_hash(Path(__file__)))
    (OUT / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in results.items() if k not in {"baseline", "adapted", "labels"}}, indent=2), flush=True)
    print("Test scores:", baseline["score"], "->", adapted["score"], flush=True)


if __name__ == "__main__":
    main()
