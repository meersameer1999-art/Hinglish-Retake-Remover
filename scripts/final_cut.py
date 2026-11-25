"""ONE COMMAND: raw video -> final version (retakes + silences removed, graphics added).

  python final_cut.py "raw_video.mp4" --lang hi-roman --style warm-canvas --captions no

What it does, in order, with no questions in between:
  1. audio_first.py : transcript -> retake detection (segment + intra-segment) -> clean audio
                      (transcript gaps refined by the waveform) -> speech-to-text of final audio
                      -> cut_from_audio.py -> WORK/cut.mp4 (perfect A/V sync)
  2. auto_story.py  : picks a few clear beats from the cleaned script -> WORK/story.js
  3. render.py      : check, contact sheet, then full render -> WORK/final.mp4

If the audio/cut is already ready, add --from-cut to skip step 1 and only redo the script,
story and render. Use --skip-stt to keep the existing transcript_edited.json as-is.

Options: --threshold 70 --intra-threshold 80 --keep best|last --pause 0.3 --min-gap 0.6
         --silence-db -40 --model NAME --device auto|cpu|cuda --height 2160 --no-captions
         --preset slow --crf 17 --workers N
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import die  # noqa: E402

SCRIPTS = os.path.dirname(os.path.abspath(__file__))


def call(script, *args):
    cmd = [sys.executable, os.path.join(SCRIPTS, script)] + [str(x) for x in args]
    print(f"\n=== {script} ===", flush=True)
    subprocess.run(cmd, check=True)


def stt_on_clean_audio(work, lang, common_args):
    kr = json.load(open(os.path.join(work, "keep_ranges.json"), encoding="utf-8"))
    clean = os.path.abspath(kr["clean_audio"])
    stt_work = os.path.join(work, "_clean_stt")
    call("transcribe.py", clean, "--work", stt_work, "--lang", lang, *common_args)
    shutil.copy2(os.path.join(stt_work, "transcript.json"), os.path.join(work, "transcript_edited.json"))
    txt = os.path.join(work, "transcript_edited.txt")
    shutil.copy2(os.path.join(stt_work, "transcript.txt"), txt)
    lines = open(txt, encoding="utf-8").read().splitlines()
    if lines:
        lines[0] = "# Script source: speech-to-text of the FINAL CLEANED audio. Times are scene timings."
    open(txt, "w", encoding="utf-8").write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--work")
    ap.add_argument("--lang", default="hi-roman", help="auto, en, hi or hi-roman (Hinglish)")
    ap.add_argument("--style", default="warm-canvas")
    ap.add_argument("--captions", choices=["yes", "no"], default="no")
    ap.add_argument("--threshold", type=int, default=70)
    ap.add_argument("--intra-threshold", type=int, default=80)
    ap.add_argument("--keep", choices=["best", "last"], default="best")
    ap.add_argument("--pause", type=float, default=0.3)
    ap.add_argument("--min-gap", type=float, default=0.6)
    ap.add_argument("--silence-db", type=float, default=-40.0)
    ap.add_argument("--model")
    ap.add_argument("--device", choices=["auto", "cpu", "cuda"])
    ap.add_argument("--height", type=int)
    ap.add_argument("--from-cut", action="store_true", help="skip audio cleaning; cut.mp4 + clean_audio.mp3 already exist")
    ap.add_argument("--skip-stt", action="store_true", help="keep the current transcript_edited.json")
    ap.add_argument("--preset", default="slow", help="x264 preset (default: slow, better quality)")
    ap.add_argument("--crf", type=int, default=17, help="quality, lower is better (default: 17)")
    ap.add_argument("--workers", type=int)
    a = ap.parse_args()

    src = os.path.abspath(a.video)
    if not os.path.exists(src):
        die(f"video not found: {src}")
    work = os.path.abspath(a.work or os.path.join(os.path.dirname(src),
                           os.path.splitext(os.path.basename(src))[0] + "_final"))
    os.makedirs(work, exist_ok=True)
    common_args = []
    if a.model:
        common_args += ["--model", a.model]
    if a.device:
        common_args += ["--device", a.device]

    if not a.from_cut:
        args = ["--work", work, "--lang", a.lang, "--style", a.style, "--captions", a.captions,
                "--threshold", a.threshold, "--intra-threshold", a.intra_threshold,
                "--keep", a.keep, "--pause", a.pause, "--min-gap", a.min_gap,
                "--waveform", "--silence-db", a.silence_db] + common_args
        if a.height:
            args += ["--height", a.height]
        call("audio_first.py", src, *args)
    else:
        for name in ("cut.mp4", "clean_audio.mp3", "keep_ranges.json"):
            if not os.path.exists(os.path.join(work, name)):
                die(f"--from-cut needs {name} in {work}")
        if not a.skip_stt:
            stt_on_clean_audio(work, a.lang, common_args)

    call("auto_story.py", work, "--style", a.style)
    call("render.py", work, "--check")
    call("render.py", work, "--stills", "auto")
    render_args = ["--preset", a.preset, "--crf", a.crf]
    if a.workers:
        render_args += ["--workers", a.workers]
    if a.height:
        render_args += ["--height", a.height]
    call("render.py", work, *render_args)

    final = os.path.join(work, "final.mp4")
    if not os.path.exists(final):
        die("render finished but final.mp4 is missing")
    print("\n=== FINAL OUTPUT ===")
    print(json.dumps({
        "final": final,
        "raw_cut": os.path.join(work, "cut.mp4"),
        "clean_audio": os.path.join(work, "clean_audio.mp3"),
        "script": os.path.join(work, "transcript_edited.txt"),
        "story": os.path.join(work, "story.js"),
        "contact_sheet": os.path.join(work, "stills", "contact.png"),
    }, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
