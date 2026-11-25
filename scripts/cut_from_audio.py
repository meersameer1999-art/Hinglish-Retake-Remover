"""Cut the raw video to the already-cleaned audio, frame-accurately.

Use after clean_audio.py (and speech-to-text on its final MP3). The video frames come from
keep_ranges.json and the audio track is muxed in as-is, so there is no second cutting pass
and the picture can never drift out of sync with the voice.

Usage:
  python cut_from_audio.py WORK [--style ID] [--captions yes|no] [--height 1080] [--dry-run]
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import die, load_state, need, out_height, probe, run, save_state, style_meta  # noqa: E402


def render_cut(src, work, frames, fps, W, H, clean_audio):
    expr = "+".join(f"between(n,{a},{b - 1})" for a, b in frames)
    vf = (f"[0:v]fps={fps},scale={W}:{H}:force_original_aspect_ratio=increase:flags=bicubic,"
          f"crop={W}:{H},setsar=1,select='{expr}',setpts=N/({fps}*TB)[v]")
    open(os.path.join(work, ".cut_filter.txt"), "w").write(vf)
    run(["ffmpeg", "-v", "error", "-y", "-i", src, "-i", clean_audio, "-/filter_complex", ".cut_filter.txt",
         "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
         "-pix_fmt", "yuv420p", "-r", str(fps), "-c:a", "aac", "-b:a", "256k",
         "-movflags", "+faststart", "cut.mp4"], cwd=work)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("work")
    ap.add_argument("--style")
    ap.add_argument("--captions", choices=["yes", "no"])
    ap.add_argument("--height", type=int)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    need("ffmpeg")
    work = os.path.abspath(a.work)
    kr_path = os.path.join(work, "keep_ranges.json")
    if not os.path.exists(kr_path):
        die(f"keep_ranges.json not found in {work}. Run clean_audio.py first.")
    kr = json.load(open(kr_path, encoding="utf-8"))
    st = load_state(work)
    src = os.path.abspath(st.get("source") or kr["source"])
    clean = os.path.abspath(st.get("clean_audio") or kr["clean_audio"])
    for p in (src, clean):
        if not os.path.exists(p):
            die(f"file not found: {p}")
    if a.style:
        style_meta(a.style)
    info = probe(src)
    frames = [[int(x), int(y)] for x, y in kr["keep_frames"]]
    if not frames:
        die("keep_ranges.json has no frames to keep")
    fps = float(kr["fps"])
    new_len = sum(b - x for x, b in frames) / fps
    diff = abs(new_len - float(kr["clean_seconds"]))
    if diff > 0.25:
        print(f"warning: video frames last {new_len:.2f}s but clean audio is {kr['clean_seconds']}s (gap {diff:.2f}s)", file=sys.stderr)

    summary = {
        "original_seconds": float(kr["source_seconds"]),
        "edited_seconds": round(new_len, 2),
        "removed_seconds": float(kr["removed_seconds"]),
        "pieces_kept": len(frames), "fps": fps,
        "clean_audio": clean,
        "mistake_cuts": [{"from_s": round(s, 2), "to_s": round(e, 2), "why": why, "text": txt}
                         for s, e, why, txt in kr.get("removed", []) if why != "pause"],
    }
    json.dump({"summary": summary, "keep_frames": frames, "removed": kr.get("removed", [])},
              open(os.path.join(work, "cut_plan.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    kv = {"fps": fps, "clean_audio_cut": True, "cut_seconds": round(new_len, 3)}
    if a.style:
        kv["style"] = a.style
    if a.captions:
        kv["captions"] = a.captions == "yes"
    if a.height:
        kv["height"] = a.height
    st = save_state(work, **kv)
    if a.dry_run:
        print(json.dumps(summary, indent=1, ensure_ascii=False))
        return

    src_ar = info["width"] / max(1, info["height"])
    if src_ar < 1.0:
        W = int(round(min(1080, info["width"]) / 2) * 2)
        H = int(round(W / src_ar / 2) * 2)
    else:
        H = out_height(info["height"], st.get("height"))
        W = int(round(H * 16 / 9 / 2) * 2)
        if src_ar < 1.6:
            print("note: this video is not 16:9, so it is center-cropped to 16:9.")
    print(f"rendering cut.mp4 from cleaned audio: {kr['source_seconds']}s -> {new_len:.2f}s, {W}x{H} @ {fps:g}fps", flush=True)
    render_cut(src, work, frames, fps, W, H, clean)
    save_state(work, width=W, height=H)
    summary["outputs"] = [os.path.join(work, "cut.mp4"), os.path.join(work, "transcript_edited.txt")]
    print(json.dumps(summary, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
