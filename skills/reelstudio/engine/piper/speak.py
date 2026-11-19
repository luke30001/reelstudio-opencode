"""Local TTS with Piper, plus word timings from Piper's own phoneme alignments (no cloud, no transcription).

Run with the Python of the piper-tts install (uv tool install 'piper-tts[alignment]'):
  python speak.py <model.onnx> < jobs.json > result.json
jobs.json: {"length_scale": 1.0, "sentence_silence": 0.25, "jobs": [{"id": "s1", "text": "...", "out": "/abs/s1.wav"}]}
result:    {"s1": {"seconds": 4.2, "words": [{"text": "Ciao", "start": 0.05, "end": 0.31}, ...]}}
"""
import json
import re
import sys
import wave

import numpy as np
from piper import PiperVoice
from piper.config import SynthesisConfig


def chunk_spans(ch, t, sr):
    """Speech spans per phoneme word (split on the space phoneme) of one sentence chunk starting at t seconds."""
    al = ch.phoneme_alignments
    if not al:
        return [(t, t + len(ch.audio_float_array) / sr)], False
    spans, cur, pos = [], None, t
    for a in al:
        dur = a.num_samples / sr
        if a.phoneme in (' ', '^', '$', '_') or re.match(r'^[.,;:!?¡¿—–-]$', a.phoneme):
            if cur:
                spans.append(cur)
                cur = None
        else:
            cur = (cur[0], pos + dur) if cur else (pos, pos + dur)
        pos += dur
    if cur:
        spans.append(cur)
    return spans, True


def assign(words, spans):
    """Map the script's words onto the speech spans: 1:1 when the counts match, else by character share."""
    if not words or not spans:
        return []
    if len(words) == len(spans):
        return [{'text': w, 'start': round(s, 3), 'end': round(e, 3)} for w, (s, e) in zip(words, spans)]
    total = sum(e - s for s, e in spans)
    chars = [max(1, len(re.sub(r'\W', '', w))) for w in words]
    csum = sum(chars)

    def at(frac):  # position in speech time -> absolute seconds
        need = frac * total
        for s, e in spans:
            if need <= e - s:
                return s + need
            need -= e - s
        return spans[-1][1]

    out, acc = [], 0
    for w, c in zip(words, chars):
        out.append({'text': w, 'start': round(at(acc / csum), 3), 'end': round(at((acc + c) / csum), 3)})
        acc += c
    return out


def main():
    voice = PiperVoice.load(sys.argv[1], include_alignments=True)
    req = json.load(sys.stdin)
    cfg = SynthesisConfig(length_scale=req.get('length_scale', 1.0), noise_scale=req.get('noise_scale'), noise_w_scale=req.get('noise_w_scale'))
    gap = float(req.get('sentence_silence', 0.25))
    sr = voice.config.sample_rate
    res = {}
    for job in req['jobs']:
        chunks = list(voice.synthesize(job['text'], cfg, include_alignments=True))
        silence = np.zeros(int(sr * gap), dtype=np.int16)
        with wave.open(job['out'], 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            for i, ch in enumerate(chunks):
                w.writeframes(ch.audio_int16_bytes)
                if i < len(chunks) - 1:
                    w.writeframes(silence.tobytes())
        text = job['text'].replace('*', '')
        sentences = [s for s in re.split(r'(?<=[.!?…])\s+', text.strip()) if s]
        per, t0, ok, nspans = [], 0.0, True, 0
        for ch in chunks:
            sp, good = chunk_spans(ch, t0, sr)
            per.append(sp)
            ok = ok and good
            nspans += len(sp)
            t0 += len(ch.audio_float_array) / sr + gap
        words = []
        if len(sentences) == len(chunks):  # align sentence by sentence: a mismatch (numbers, symbols) stays local
            for s, sp in zip(sentences, per):
                words += assign(s.split(), sp)
        else:
            words = assign(text.split(), [x for sp in per for x in sp])
        spans = [x for sp in per for x in sp]
        secs = sum(len(c.audio_float_array) for c in chunks) / sr + gap * max(0, len(chunks) - 1)
        res[job['id']] = {'seconds': round(secs, 3), 'aligned': ok, 'words': words}
        print(f"  {job['id']}: {secs:.2f}s ({len(spans)} spoken words, {len(words)} written)", file=sys.stderr)
    json.dump(res, sys.stdout)


if __name__ == '__main__':
    main()
