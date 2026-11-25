"""Extract the voice from a raw video, remove retakes + silences, and export final audio.

This is the audio-first step of the editing pipeline. It reads the transcript and the retake
cuts in edits.json (from detect_retakes.py), plans the same cuts cut.py would make, snaps them
to video frames, and exports a cleaned MP3 plus a keep-ranges map. cut_from_audio.py uses that
map later so the video frames and the cleaned audio stay in perfect sync.

Usage:
  python clean_audio.py WORK [--pause 0.3] [--min-gap 0.6] [--no-silence] [--source VIDEO]
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import die, load_state, pick_fps, probe, run, save_state  # noqa: E402
from cut import SR, load_audio, merge, plan, remap_words, snap  # noqa: E402
from transcribe import write_txt  # noqa: E402


def build_clean_pcm(audio, frames, fps):
    """Concatenate the kept frame ranges with 6 ms fades at every join (click-free)."""
    parts, f = [], int(SR * 0.006)
    ramp = np.linspace(0, 1, f, dtype=np.float32)[:, None]
    for a, b in frames:
        s0, s1 = int(round(a / fps * SR)), int(round(b / fps * SR))
        seg = audio[s0:s1].copy()
        if len(seg) < s1 - s0:
            seg = np.vstack([seg, np.zeros((s1 - s0 - len(seg), 2), np.float32)])
        if len(seg) > 2 * f:
            seg[:f] *= ramp
            seg[-f:] *= ramp[::-1]
        parts.append(seg)
    return np.clip(np.vstack(parts), -1, 1) if parts else np.zeros((0, 2), np.float32)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("work")
    ap.add_argument("--source", help="raw video (default: from edit.json / transcript.json)")
    ap.add_argument("--pause", type=float, default=0.3, help="seconds of pause left where a long silence was removed")
    ap.add_argument("--min-gap", type=float, default=0.6, help="silences shorter than this are kept")
    ap.add_argument("--no-silence", action="store_true", help="remove retakes only, keep all silences")
    a = ap.parse_args()

    work = os.path.abspath(a.work)
    tr_path = os.path.join(work, "transcript.json")
    if not os.path.exists(tr_path):
        die(f"transcript.json not found in {work}. Run transcribe.py on the raw video first.")
    tr = json.load(open(tr_path, encoding="utf-8"))
    st = load_state(work)
    src = os.path.abspath(a.source or st.get("source") or tr["source"])
    if not os.path.exists(src):
        die(f"source video not found: {src}")
    info = probe(src)
    if not info["has_audio"]:
        die("the raw video has no audio track")

    audio = load_audio(src)
    duration = min(info["duration"], len(audio) / SR) if len(audio) else info["duration"]
    ed_path = os.path.join(work, "edits.json")
    edits = json.load(open(ed_path, encoding="utf-8")) if os.path.exists(ed_path) else {}
    gone = set()
    for r in edits.get("remove", []):
        lo, hi = sorted((int(r["from"]), int(r["to"])))
        gone.update(range(lo, hi + 1))

    # Mistakes only from cut.py's planner. Silence is handled from word gaps below, because an
    # energy-based detector misses long pauses when the recording has music or room noise.
    opt = argparse.Namespace(silence=False, pause=a.pause, min_gap=a.min_gap)
    _, removed, stats = plan(tr["words"], duration, audio, opt, edits)

    silences = []
    if not a.no_silence:
        pad = a.pause / 2
        kept_words = [w for w in tr["words"] if w["i"] not in gone]
        if kept_words:
            if kept_words[0]["s"] - pad >= a.min_gap:
                silences.append([0.0, max(0.0, kept_words[0]["s"] - pad)])
            for prev, nxt in zip(kept_words, kept_words[1:]):
                s, e = prev["e"] + pad, nxt["s"] - pad
                if e - s >= a.min_gap:
                    silences.append([s, e])
            if duration - (kept_words[-1]["e"] + pad) >= a.min_gap:
                silences.append([kept_words[-1]["e"] + pad, duration])
        removed += [[s, e, "pause", ""] for s, e in silences]

    cuts = merge([[max(0.0, s), min(duration, e)] for s, e, *_ in removed if e - s > 0.02])
    keep, cur = [], 0.0
    for s, e in cuts:
        if s > cur:
            keep.append([cur, s])
        cur = max(cur, e)
    if cur < duration:
        keep.append([cur, duration])

    fps = pick_fps(info["fps"])
    frames = snap(keep, fps, duration)
    if not frames:
        die("the plan removes the whole audio. Check edits.json and --min-gap.")

    pcm = build_clean_pcm(audio, frames, fps)
    wav = os.path.join(work, "clean_audio.wav")
    mp3 = os.path.join(work, "clean_audio.mp3")
    import wave
    with wave.open(wav, "wb") as wv:
        wv.setnchannels(2)
        wv.setsampwidth(2)
        wv.setframerate(SR)
        wv.writeframes((pcm * 32767).astype("<i2").tobytes())
    run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "libmp3lame", "-b:a", "192k", mp3])

    ew, elen = remap_words(tr["words"], gone, frames, fps)
    json.dump({"language": tr.get("language"), "duration": round(elen, 3), "words": ew},
              open(os.path.join(work, "transcript_edited.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    write_txt(os.path.join(work, "transcript_edited.txt"), ew, elen, "Draft transcript of the CLEANED audio (will be replaced by speech-to-text on the final MP3).")

    seconds = [[round(x / fps, 3), round(y / fps, 3)] for x, y in frames]
    clean_len = len(pcm) / SR
    # Removed ranges can overlap (a retake can sit inside a pause), so measure the real gap.
    removed_s = round(max(0.0, duration - clean_len), 2)
    ranges = {
        "source": src, "fps": fps, "source_seconds": round(info["duration"], 3),
        "clean_seconds": round(clean_len, 3), "removed_seconds": removed_s,
        "keep_frames": frames, "keep_seconds": seconds,
        "removed": removed, "audio_levels": stats,
        "clean_audio": mp3, "clean_wav": wav,
        "note": "Frames and clean audio share the same timeline; cut_from_audio.py muxes them directly.",
    }
    json.dump(ranges, open(os.path.join(work, "keep_ranges.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    save_state(work, clean_audio=mp3, clean_seconds=round(clean_len, 3), clean_fps=fps)
    print(json.dumps({
        "source_seconds": round(info["duration"], 2), "clean_seconds": round(clean_len, 2),
        "removed_seconds": removed_s, "retake_cuts": len(edits.get("remove", [])),
        "pieces_kept": len(frames), "clean_audio": mp3,
        "keep_ranges": os.path.join(work, "keep_ranges.json"),
        "next": "transcribe the final MP3 (speech-to-text), then run cut_from_audio.py",
    }, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
