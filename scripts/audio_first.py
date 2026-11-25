"""Audio-first editing pipeline: raw video -> clean final audio -> STT/script -> video cut.

Run this when the user hands over a raw talking-head video and wants the retakes and silences
removed on the AUDIO first, then the rest of the edit driven by that final audio.

Steps (all local and free):
  1. transcribe.py on the raw video          -> original word timings
  2. detect_retakes.py                       -> repeated-take cuts (thefuzz, like Hinglish-Retake-Remover)
  3. clean_audio.py                          -> clean_audio.mp3 + keep_ranges.json (frame-exact map)
  4. transcribe.py on clean_audio.mp3        -> speech-to-text of the FINAL audio = the script
  5. cut_from_audio.py                       -> cut.mp4 (video cut by the map, clean audio muxed as-is)

After this, follow steps 5-7 of SKILL.md: read WORK/transcript_edited.txt, plan scenes, write
story.js, check stills and render final.mp4.

Usage:
  python audio_first.py VIDEO [--work FOLDER] [--lang auto|en|hi|hi-roman] [--style ID]
                              [--captions yes|no] [--threshold 70] [--keep best|last]
                              [--pause 0.3] [--min-gap 0.6] [--no-silence] [--model NAME]
"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import die  # noqa: E402

SCRIPTS = os.path.dirname(os.path.abspath(__file__))


def call(script, *args):
    cmd = [sys.executable, os.path.join(SCRIPTS, script)] + [str(x) for x in args]
    print(f"\n=== {script} ===", flush=True)
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--lang", default="auto", help="auto, en, hi (Devanagari) or hi-roman (Hinglish in Latin letters)")
    ap.add_argument("--model", help="Whisper model name, e.g. medium, large-v3-turbo")
    ap.add_argument("--device", choices=["auto", "cpu", "cuda"])
    ap.add_argument("--style")
    ap.add_argument("--captions", choices=["yes", "no"])
    ap.add_argument("--height", type=int)
    ap.add_argument("--threshold", type=int, default=70)
    ap.add_argument("--keep", choices=["best", "last"], default="best")
    ap.add_argument("--pause", type=float, default=0.3)
    ap.add_argument("--min-gap", type=float, default=0.6)
    ap.add_argument("--no-silence", action="store_true")
    ap.add_argument("--waveform", action="store_true", help="refine transcript silences with the waveform (never cuts inside words)")
    ap.add_argument("--silence-db", type=float, default=-40.0, help="waveform silence threshold in dBFS (default: -40)")
    ap.add_argument("--skip-stt", action="store_true", help="use the draft transcript from the raw video instead of transcribing the final audio")
    ap.add_argument("--no-cut", action="store_true", help="stop after the final audio + script are ready")
    a = ap.parse_args()

    src = os.path.abspath(a.video)
    if not os.path.exists(src):
        die(f"video not found: {src}")
    work = os.path.abspath(a.work or os.path.join(os.path.dirname(src), os.path.splitext(os.path.basename(src))[0] + "_edit"))
    os.makedirs(work, exist_ok=True)
    common_args = []
    if a.model:
        common_args += ["--model", a.model]
    if a.device:
        common_args += ["--device", a.device]

    # 1. Original transcript, used only to find the retakes.
    call("transcribe.py", src, "--work", work, "--lang", a.lang, *common_args)

    # 2. Fuzzy repeated-take detection -> edits.json.
    call("detect_retakes.py", work, "--threshold", a.threshold, "--keep", a.keep)

    # 3. Clean audio + frame-exact keep map.
    clean_args = ["--pause", a.pause, "--min-gap", a.min_gap, "--source", src]
    if a.no_silence:
        clean_args.append("--no-silence")
    if a.waveform:
        clean_args += ["--waveform", "--silence-db", a.silence_db]
    call("clean_audio.py", work, *clean_args)

    kr = json.load(open(os.path.join(work, "keep_ranges.json"), encoding="utf-8"))
    clean_audio = os.path.abspath(kr["clean_audio"])

    # 4. Speech-to-text on the FINAL audio. This transcript is the script/scene source.
    if not a.skip_stt:
        stt_work = os.path.join(work, "_clean_stt")
        call("transcribe.py", clean_audio, "--work", stt_work, "--lang", a.lang, *common_args)
        shutil_copy = __import__("shutil").copy2
        shutil_copy(os.path.join(stt_work, "transcript.json"), os.path.join(work, "transcript_edited.json"))
        txt = os.path.join(work, "transcript_edited.txt")
        shutil_copy(os.path.join(stt_work, "transcript.txt"), txt)
        with open(txt, encoding="utf-8") as f:
            lines = f.read().splitlines()
        if lines:
            lines[0] = "# Script source: speech-to-text of the FINAL CLEANED audio (clean_audio.mp3). Use these times for scenes."
        with open(txt, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

    if not a.no_cut:
        cut_args = []
        if a.style:
            cut_args += ["--style", a.style]
        if a.captions:
            cut_args += ["--captions", a.captions]
        if a.height:
            cut_args += ["--height", a.height]
        call("cut_from_audio.py", work, *cut_args)

    report = {
        "work": work, "clean_audio": clean_audio,
        "clean_seconds": kr["clean_seconds"],
        "kept_pieces": len(kr["keep_frames"]),
        "script": os.path.join(work, "transcript_edited.txt"),
        "cut_video": None if a.no_cut else os.path.join(work, "cut.mp4"),
        "next": "Read transcript_edited.txt, plan the visual scenes, write story.js, then render.py WORK",
    }
    print("\n=== pipeline complete ===")
    print(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
