"""Exploratory audio-change scores; never writes to the application's library."""
import os
for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMBA_NUM_THREADS'):
    os.environ[key] = '1'
import argparse
import concurrent.futures
import hashlib
import json
import math
import time
from pathlib import Path
import numpy as np
import librosa

SR, HOP = 22050, 256
VERSION = 'clarity-experiment-v2'
DIATONIC = {
    'major': {(0,'maj'),(2,'min'),(4,'min'),(5,'maj'),(7,'maj'),(9,'min'),(11,'dim')},
    'minor': {(0,'min'),(2,'dim'),(3,'maj'),(5,'min'),(7,'min'),(8,'maj'),(10,'maj')},
}

def bounded(x):
    return float(np.clip(x, 0, 1))

def chord_key(chord):
    return chord['rootPc'], chord['quality']

def runs(entry):
    result = []
    for chord, cue in zip(entry['chords'], entry['cueTimesSec'], strict=True):
        if not result or chord_key(result[-1]['chord']) != chord_key(chord):
            result.append({'start': float(cue), 'chord': chord})
    for i, run in enumerate(result):
        run['end'] = result[i+1]['start'] if i+1 < len(result) else entry['durationSec']
        assert run['end'] > run['start']
    return result

def distance(a, b):
    denom = np.linalg.norm(a)*np.linalg.norm(b)
    return bounded(1 - float(np.dot(a,b))/denom) if denom > 1e-12 else 0.0

def chroma_features(y):
    cqt = np.abs(librosa.cqt(y=y, sr=SR, hop_length=HOP, fmin=librosa.note_to_hz('C1'), n_bins=84, bins_per_octave=12))
    harmonic, _ = librosa.decompose.hpss(cqt, kernel_size=(17,17), margin=2.0)
    full = harmonic.reshape(7,12,-1).sum(axis=0)
    bass = harmonic[:24].reshape(2,12,-1).sum(axis=0)
    energy = np.sum(full, axis=0)
    return full, bass, energy

def window_stats(matrix, times, start, end):
    frames = matrix[:, (times >= start) & (times < end)]
    if frames.shape[1] == 0:
        frames = matrix[:, [int(np.argmin(abs(times-(start+end)/2)))]]
    normalized = frames / np.maximum(np.linalg.norm(frames, axis=0), 1e-12)
    center = np.mean(normalized, axis=1)
    spread = float(np.mean([distance(normalized[:,i],center) for i in range(frames.shape[1])]))
    return center, spread

def transition_features(full, bass, energy, times, before, after, shift=0):
    boundary = after['start'] + shift
    # Windows stay inside the adjacent runs, with a small guard around the cue.
    left_span = boundary-before['start']
    right_span = after['end']-boundary
    guard = min(.08, .12*min(left_span, right_span))
    width_left = min(.65, .65*left_span)
    width_right = min(.65, .65*right_span)
    left = (max(before['start'],boundary-guard-width_left),boundary-guard)
    right = (boundary+guard,min(after['end'],boundary+guard+width_right))
    a, sa = window_stats(full,times,*left)
    b, sb = window_stats(full,times,*right)
    ba, _ = window_stats(bass,times,*left)
    bb, _ = window_stats(bass,times,*right)
    contrast = distance(a,b)
    spread = (sa+sb)/2
    bass_contrast = distance(ba,bb)
    prominence = contrast/(contrast+spread+.04)
    full_score = bounded(contrast/.35)
    bass_score = bounded(bass_contrast/.50)
    clarity = 100*(.50*full_score + .30*prominence + .20*bass_score)
    mask = ((times>=left[0]) & (times<left[1])) | ((times>=right[0]) & (times<right[1]))
    low_energy = not mask.any() or float(np.mean(energy[mask])) < float(np.max(energy))*.001
    if low_energy:
        clarity=0.0
    return dict(clarity=clarity, chromaDistance=contrast, withinChordSpread=spread,
                prominence=prominence, bassDistance=bass_contrast, lowEnergy=low_energy)

def aggregate_hard(values):
    return float(.75*np.mean(values)+.25*np.percentile(values,90))

def harmonic_complexity(entry, seq):
    keys=[chord_key(r['chord']) for r in seq]
    # Match app vocabulary: harmonic-minor V is classified as chromatic here.
    chromatic=np.mean([k not in DIATONIC[entry['mode']] for k in keys])
    diminished=np.mean([k[1]=='dim' for k in keys])
    vocabulary=bounded((len(set(keys))-2)/4)
    return float(100*(.50*chromatic+.20*diminished+.30*vocabulary))

def analyze(job):
    entry, variant, path = job
    started=time.time()
    y, _ = librosa.load(path, sr=SR, mono=True)
    assert np.isfinite(y).all() and len(y)>0
    assert abs(len(y)/SR-entry['durationSec'])<.3, (path,len(y)/SR,entry['durationSec'])
    seq=runs(entry)
    assert len(seq)>1
    full,bass,energy=chroma_features(y)
    times=librosa.frames_to_time(np.arange(full.shape[1]),sr=SR,hop_length=HOP)
    transitions=[]
    for i in range(1,len(seq)):
        before,after=seq[i-1],seq[i]
        feat=transition_features(full,bass,energy,times,before,after)
        offset_scores=[transition_features(full,bass,energy,times,before,after,-.08)['clarity'],feat['clarity'],
                       transition_features(full,bass,energy,times,before,after,.08)['clarity']]
        feat['clarityAtCue']=feat['clarity']
        feat['clarity']=float(np.median(offset_scores))
        duration=after['end']-after['start']
        pace=100*bounded(math.log(3/duration)/math.log(3/.4))
        transitions.append(dict(time=after['start'],fromChord=before['chord'],toChord=after['chord'],
            secondsAvailable=duration,pace=pace,clarityByOffset=offset_scores,
            cueSensitivity=max(offset_scores)-min(offset_scores),**feat))
    clarity=100-aggregate_hard([100-t['clarity'] for t in transitions])
    pace=aggregate_hard([t['pace'] for t in transitions])
    complexity=harmonic_complexity(entry,seq)
    result=dict(id=entry['id'],artist=entry['artist'],title=entry['title'],variant=variant,
        startMeasure=entry['startMeasure'],endMeasure=entry['endMeasure'],file=str(path),
        sha256=hashlib.sha256(Path(path).read_bytes()).hexdigest(),duration=entry['durationSec'],
        key=entry['key'],mode=entry['mode'],uniqueChords=len(set(map(chord_key,entry['chords']))),
        oldDifficulty='beginner' if len(set(map(chord_key,entry['chords'])))<=3 else 'advanced',
        heldSlotsCollapsed=len(entry['chords'])-len(seq),transitionCount=len(transitions),
        clarity=clarity,pace=pace,complexity=complexity,difficulty=.70*(100-clarity)+.20*pace+.10*complexity,
        medianSeconds=float(np.median([t['secondsAvailable'] for t in transitions])),
        cueSensitivity=float(np.max([t['cueSensitivity'] for t in transitions])),
        clarityByOffset=[100-aggregate_hard([100-t['clarityByOffset'][j] for t in transitions]) for j in range(3)],
        transitions=transitions,elapsedSec=time.time()-started)
    return result

def validate():
    entry=dict(chords=[dict(rootPc=0,quality='maj'),dict(rootPc=0,quality='maj'),dict(rootPc=7,quality='maj')],cueTimesSec=[0,1,2],durationSec=4)
    assert len(runs(entry))==2 and runs(entry)[0]['end']==2
    assert distance(np.array([1.,0]),np.array([2.,0]))<1e-9
    assert distance(np.array([1.,0]),np.array([0.,1]))==1
    # End-to-end signal controls: sustained C, changed C/G, changed C/Am, noise.
    def triad(freqs, duration=2):
        t=np.arange(int(SR*duration))/SR
        return sum(np.sin(2*np.pi*f*t)+.25*np.sin(4*np.pi*f*t) for f in freqs)/len(freqs)
    c=triad([130.8128,164.8138,195.9977])
    controls={}
    for label,end in [('held_C',c),('C_to_G',triad([97.9989,123.4708,146.8324])),('C_to_Am',triad([110,130.8128,164.8138])),('C_louder',2*c)]:
        full,bass,energy=chroma_features(np.concatenate([c,end]))
        times=librosa.frames_to_time(np.arange(full.shape[1]),sr=SR,hop_length=HOP)
        controls[label]=transition_features(full,bass,energy,times,{'start':0,'end':2},{'start':2,'end':4})['clarity']
    assert controls['held_C']<5 and controls['C_louder']<5
    assert controls['C_to_G']>controls['C_to_Am']>controls['held_C']+10
    return controls


def publish_scores(data, manifest, manifest_path, output):
    """Bundle song-level averages, guarded by audio revision and entry metadata."""
    assert data['complete'] and data['version']==VERSION
    assert data['manifestSha256']==hashlib.sha256(manifest_path.read_bytes()).hexdigest(), 'Report is stale; rescore rotation'
    rows=data['excerpts']
    by_id={(row['id'],row['variant']):row for row in rows}
    expected={(entry['id'],variant) for entry in manifest['clips'] for variant,field in [('original','file'),('instrumental','instrumentalFile')] if entry.get(field)}
    assert len(by_id)==len(rows) and set(by_id)==expected
    for entry in manifest['clips']:
        for variant,field in [('original','file'),('instrumental','instrumentalFile')]:
            if not entry.get(field): continue
            row=by_id[(entry['id'],variant)]
            assert row['sha256']==hashlib.sha256((manifest_path.parent/entry[field]).read_bytes()).hexdigest()
            for metric in ('clarity','pace','complexity'):
                assert math.isfinite(row[metric]) and 0<=row[metric]<=100
    entries={}
    fields=('artist','title','file','instrumentalFile','key','mode','bpm','durationSec','startMeasure','endMeasure','chords','cueTimesSec','measureChordCounts')
    for entry in manifest['clips']:
        item={'identity':{field:entry.get(field) for field in fields}}
        for variant in ('original','instrumental'):
            group=[row for row in rows if row['artist']==entry['artist'] and row['title']==entry['title'] and row['variant']==variant]
            if group:
                item[variant]={metric:float(np.mean([row[metric] for row in group])) for metric in ('clarity','pace','complexity')}
        entries[entry['id']]=item
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({'model':VERSION,'libraryVersion':manifest['version'],'entries':entries},ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    print('Bundled song scores:',output,flush=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument('--output',type=Path,default=Path('.recordings/difficulty/rotation-scores.json'))
    parser.add_argument('--reuse-report', action='store_true', help='Validate an existing report and rebuild bundled scores without audio analysis')
    parser.add_argument('--app-output',type=Path,default=Path('src/songs/rotation-difficulty.json'))
    parser.add_argument('--workers',type=int,default=3)
    args=parser.parse_args()
    manifest_path=args.repo/'public/rotation-clips/manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    if args.reuse_report:
        data=json.loads(args.output.read_text(encoding='utf-8'))
        publish_scores(data,manifest,manifest_path,args.app_output)
        return
    controls=validate()
    print('Synthetic controls:',json.dumps(controls),flush=True)
    jobs=[(entry,variant,str(manifest_path.parent/entry[field])) for entry in manifest['clips'] for variant,field in [('original','file'),('instrumental','instrumentalFile')] if entry.get(field)]
    result=[]
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        for index,row in enumerate(pool.map(analyze,jobs),1):
            result.append(row)
            if index%20==0 or index==len(jobs):
                print(f'{index}/{len(jobs)} audio variants scored',flush=True)
                args.output.write_text(json.dumps(dict(version=VERSION,complete=False,excerpts=result),ensure_ascii=False),encoding='utf-8')
    result.sort(key=lambda r:(r['artist'],r['title'],r['startMeasure'],r['variant']))
    for row in result:
        for metric in ['clarity','pace','complexity','difficulty']:
            assert math.isfinite(row[metric]) and 0<=row[metric]<=100
    data=dict(version=VERSION,complete=True,manifestVersion=manifest['version'],manifestSha256=hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        rotationRefreshedAt=manifest['refreshedAt'],sourceCount=manifest['sourceCount'],controls=controls,
        weights=dict(clarity=.7,pace=.2,complexity=.1),libraries=dict(librosa=librosa.__version__,numpy=np.__version__),excerpts=result)
    args.output.write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    publish_scores(data,manifest,manifest_path,args.app_output)
    print('Complete:',args.output,flush=True)

if __name__=='__main__':
    main()
