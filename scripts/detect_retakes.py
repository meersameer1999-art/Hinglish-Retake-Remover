"""Find repeated takes (retakes) in an existing transcript and turn them into cuts.

This is the video-workflow half of the Hinglish-Retake-Remover idea: it uses the same
Whisper + fuzzy-match logic, but instead of exporting a separate cleaned MP3 (which would
desync the picture), it writes word ranges into edits.json so cut.py removes the exact
frames from the video and the audio together.

Usage:
  python detect_retakes.py WORK [--threshold 70] [--keep best|last] [--no-merge] [--dry-run]

Needs a transcript.json from transcribe.py. Prints JSON. Writes:
  WORK/retakes.json   all proposals, with similarity and confidence
  WORK/edits.json     proposals merged into the "remove" list (unless --no-merge)
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import die  # noqa: E402


def normalize(text):
    """Lowercase, drop punctuation and extra spaces so 'Hai,' == 'hai'."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (text or "").lower(), flags=re.UNICODE)).strip()


def segments_with_confidence(words, segments):
    """faster-whisper stores per-word probabilities, not avg_logprob. Average them per segment."""
    out = []
    for k, s in enumerate(segments):
        probs = [w.get("p", 1) for w in words[s["w0"]:s["w1"] + 1]]
        out.append(dict(s, _idx=k, _conf=sum(probs) / len(probs) if probs else 0.0))
    return out


def detect_intra(words, segments, threshold=85, min_words=4):
    """Catch repeats inside ONE Whisper segment (fuzz on segments alone misses these)."""
    try:
        from thefuzz import fuzz
    except ImportError:
        die("thefuzz is missing. Install it with: python -m pip install thefuzz")

    proposals = []
    for seg in segments:
        ws = words[seg["w0"]:seg["w1"] + 1]
        toks = [normalize(w["w"]) for w in ws]
        n = len(toks)
        if n < 2 * min_words:
            continue
        marked = set()
        for length in range(min(16, n // 2), min_words - 1, -1):
            for i in range(n - length + 1):
                if any(k in marked for k in range(i, i + length)):
                    continue
                first = " ".join(toks[i:i + length])
                best_j, best_ratio = None, 0
                for j in range(i + length, n - length + 1):
                    if any(k in marked for k in range(j, j + length)):
                        continue
                    r = fuzz.ratio(first, " ".join(toks[j:j + length]))
                    if r >= threshold and r > best_ratio:
                        best_j, best_ratio = j, r
                if best_j is None:
                    continue
                marked.update(range(i, i + length))
                a, b = seg["w0"] + i, seg["w0"] + i + length - 1
                ka, kb = seg["w0"] + best_j, seg["w0"] + best_j + length - 1
                proposals.append({
                    "from": a, "to": b,
                    "why": f"auto retake: repeated phrase inside segment (match {best_ratio}%, kept later w{ka}-w{kb})",
                    "from_s": words[a]["s"], "to_s": words[b]["e"],
                    "removed_text": " ".join(w["w"] for w in words[a:b + 1]),
                    "kept_from": ka, "kept_to": kb,
                    "kept_text": " ".join(w["w"] for w in words[ka:kb + 1]),
                    "similarity": best_ratio,
                    "confidence": round(sum(w.get("p", 1) for w in words[a:b + 1]) / length, 3),
                    "source": "intra-segment",
                })
    return proposals


def overlaps(a, b):
    return not (a["to"] < b["from"] or b["to"] < a["from"])


def detect(words, segments, threshold=70, keep="best", intra_threshold=85, intra=True):
    """Group adjacent near-identical segments; propose removing all but the kept take."""
    try:
        from thefuzz import fuzz
    except ImportError:
        die("thefuzz is missing. Install it with: python -m pip install thefuzz")

    segs = segments_with_confidence(words, segments)
    proposals, groups = [], []
    i = 0
    while i < len(segs):
        current = segs[i]
        group = [current]
        j = i + 1
        while j < len(segs):
            ratio = fuzz.ratio(normalize(current["text"]), normalize(segs[j]["text"]))
            if ratio > threshold:
                group.append(dict(segs[j], _ratio=ratio))
                j += 1
            else:
                break
        if len(group) > 1:
            winner = group[-1] if keep == "last" else max(group, key=lambda s: (s["_conf"], s["_idx"]))
            for take in group:
                if take is winner or take["_idx"] == winner["_idx"]:
                    continue
                proposals.append({
                    "from": take["w0"], "to": take["w1"],
                    "why": f"auto retake: repeated take (match {take.get('_ratio', 100)}%, kept w{winner['w0']}-w{winner['w1']})",
                    "from_s": take["s"], "to_s": take["e"],
                    "removed_text": take["text"],
                    "kept_from": winner["w0"], "kept_to": winner["w1"],
                    "kept_text": winner["text"],
                    "similarity": take.get("_ratio", 100),
                    "confidence": round(take["_conf"], 3),
                })
            groups.append({
                "from_s": current["s"], "to_s": group[-1]["e"],
                "takes": len(group), "similarity": min(t.get("_ratio", 100) for t in group[1:]),
                "kept_w": f"{winner['w0']}-{winner['w1']}", "kept_text": winner["text"],
            })
        i = j
    if intra:
        for p in detect_intra(words, segments, intra_threshold):
            if any(overlaps(p, q) for q in proposals):
                continue
            proposals.append(p)
            groups.append({"from_s": p["from_s"], "to_s": p["to_s"], "takes": 2,
                           "similarity": p["similarity"], "kept_w": f"{p['kept_from']}-{p['kept_to']}",
                           "kept_text": p["kept_text"], "source": "intra-segment"})
    proposals.sort(key=lambda p: p["from"])
    return proposals, groups


def merge_edits(path, proposals):
    """Add proposals to edits.json without touching manual cuts or creating overlaps."""
    edits = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    existing = edits.get("remove", [])
    busy = [(int(r["from"]), int(r["to"])) for r in existing]
    added = []
    for p in proposals:
        a, b = p["from"], p["to"]
        if any(a <= y and b >= x for x, y in busy):
            continue  # a human already marked this area; their cut wins
        busy.append((a, b))
        added.append({"from": a, "to": b, "why": p["why"]})
    edits["remove"] = sorted(existing + added, key=lambda r: int(r["from"]))
    json.dump(edits, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    return len(added)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("work", help="project folder made by transcribe.py")
    ap.add_argument("--threshold", type=int, default=70, help="fuzzy match percentage (default: 70, same as the audio remover)")
    ap.add_argument("--keep", choices=["best", "last"], default="best", help="keep the highest-confidence take or always the last one")
    ap.add_argument("--intra-threshold", type=int, default=85, help="fuzzy match for repeated phrases INSIDE one segment (default: 85)")
    ap.add_argument("--no-intra", action="store_true", help="only compare whole segments, skip repeated phrases inside them")
    ap.add_argument("--no-merge", action="store_true", help="only write retakes.json, leave edits.json alone")
    ap.add_argument("--dry-run", action="store_true", help="print proposals only; write nothing")
    a = ap.parse_args()

    work = os.path.abspath(a.work)
    tr_path = os.path.join(work, "transcript.json")
    if not os.path.exists(tr_path):
        die(f"transcript.json not found in {work}. Run transcribe.py first.")
    tr = json.load(open(tr_path, encoding="utf-8"))
    proposals, groups = detect(tr["words"], tr.get("segments", []), a.threshold, a.keep,
                               a.intra_threshold, not a.no_intra)

    report = {
        "threshold": a.threshold, "keep": a.keep, "intra_threshold": a.intra_threshold,
        "retake_groups": len(groups),
        "cuts_proposed": len(proposals),
        "seconds_proposed": round(sum(p["to_s"] - p["from_s"] for p in proposals), 2),
        "groups": groups, "proposals": proposals,
    }
    if not a.dry_run:
        json.dump({"threshold": a.threshold, "keep": a.keep, "intra_threshold": a.intra_threshold,
                   "groups": groups, "proposals": proposals},
                  open(os.path.join(work, "retakes.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        report["retakes_json"] = os.path.join(work, "retakes.json")
        if not a.no_merge:
            path = os.path.join(work, "edits.json")
            report["edits_merged"] = merge_edits(path, proposals)
            report["edits_json"] = path
    print(json.dumps(report, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
