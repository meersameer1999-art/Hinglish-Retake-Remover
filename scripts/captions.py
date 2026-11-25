"""Word-by-word captions (ASS subtitles) matched to each style. render.py calls this automatically when
captions are on; run it yourself only to inspect the file:  python captions.py WORK

The caption text comes from transcript_edited.json. To fix a misheard word, or to show Hindi in Roman letters,
edit the "w" values there (or add a "cap" value to a word, which is shown instead of "w").
Captions are hidden while graphics are on screen (inside EDIT.SPANS).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import die, load_state  # noqa: E402

# per style: font file stem (assets/fonts/ttf), size at 1080p, text colour, highlight colour, outline colour, outline px, shadow px, uppercase
STYLE = {
    "creator-motion-graphics": ("inter-800", 74, "#f4f1ea", "#ffd60a", "#000000", 0, 3, True),
    "warm-canvas": ("fraunces-600", 80, "#ffffff", "#4f9cf0", "#000000", 0, 3, False),
    "clean-tech": ("inter-tight-800", 74, "#ffffff", "#7d9bff", "#0d0f14", 0, 3, False),
    "software-walkthrough": ("dm-sans-700", 72, "#ffffff", "#9b9bff", "#14161c", 0, 3, False),
    "data-story": ("archivo-800", 74, "#eef1f5", "#ff6b5b", "#0f141c", 0, 3, False),
    "chalk-talk": ("kalam-700", 82, "#f2efe6", "#f4d35e", "#24392f", 3, 2, False),
    "pop-info": ("fredoka-700", 78, "#ffffff", "#ffd86b", "#2f3e46", 4, 0, False),
}
DEVA = re.compile(r"[ऀ-ॿ]")


def ass_color(hexcol, alpha=0):
    h = hexcol.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ts(t):
    t = max(0.0, t)
    h, m = int(t // 3600), int(t % 3600 // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def chunks(words, max_words=5, max_chars=30, gap=0.45):
    out, cur = [], []
    for w in words:
        txt = w.get("cap", w["w"])
        if cur:
            n = sum(len(x.get("cap", x["w"])) + 1 for x in cur) + len(txt)
            if w["s"] - cur[-1]["e"] > gap or len(cur) >= max_words or n > max_chars or cur[-1].get("cap", cur[-1]["w"])[-1:] in ".?!।,":
                out.append(cur)
                cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return out


def build_kold(work, words, W, H, out="captions.ass"):
    """Kold-style captions: 2-5 words at a time, white bold sans with occasional serif-italic
    emphasis words ("serif": true on a word in transcript_edited.json), a soft blurred glow
    behind the text, and non-active words dimmed (karaoke by light, not colour)."""
    portrait = H > W
    k = (W / 1080) if portrait else (H / 1080)
    size = int(76 * k)
    mv = int(H * 0.22) if portrait else int(270 * k)
    white = "&H00FFFFFF"
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KSans,CVE inter-700,{size},{white},{white},{white},{white},0,0,0,0,100,100,0,0,1,0,0,2,60,60,{mv},1
Style: KGlow,CVE inter-700,{size},{white},{white},{white},{white},0,0,0,0,100,100,0,0,1,0,0,2,60,60,{mv},1
Style: KShad,CVE inter-700,{size},&H00000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,60,60,{mv},1
Style: KDeva,CVE noto-sans-devanagari-700,{int(size * 0.92)},{white},{white},{white},{white},0,0,0,0,100,100,0,0,1,0,0,2,60,60,{mv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    DIM = "&H66&"   # non-active words: main text 60% opacity
    GLOW_DIM = "&HCC&"  # non-active glow: outline+fill at 20% opacity (the halo hugs the active word)
    ev = []
    groups = chunks(words, max_words=3, max_chars=20) if portrait else chunks(words, max_words=4, max_chars=28)
    for gi, g in enumerate(groups):
        texts = [w.get("cap", w["w"]).replace("{", "(").replace("}", ")") for w in g]
        deva = any(DEVA.search(t) for t in texts)
        sty_main = "KDeva" if deva else "KSans"
        sty_glow = "KGlow"
        end_all = g[-1]["e"] + 0.25
        if gi + 1 < len(groups):
            end_all = min(end_all, groups[gi + 1][0]["s"])
        for i, w in enumerate(g):
            s = w["s"] if i else g[0]["s"]
            e = g[i + 1]["s"] if i + 1 < len(g) else end_all
            if e <= s:
                continue
            pop = "{\\fad(80,100)}" if i == 0 else ""
            main_parts, glow_parts, shad_parts = [], [], []
            for j, t in enumerate(texts):
                active = j == i
                fa = "&H00&" if active else DIM
                ga = "&H00&" if active else GLOW_DIM
                if g[j].get("serif") and not deva:
                    fn = "CVE fraunces-600\\i1\\b0"
                else:
                    fn = "CVE inter-700\\i0"
                main_parts.append("{\\1a" + fa + "\\fn" + fn + "}" + t)
                glow_parts.append("{\\fn" + fn + "\\3a" + ga + "\\1a" + ga + "}" + t)
                shad_parts.append("{\\fn" + fn + "\\1a&H59&\\3a&H59&}" + t)
            # layer 0: soft dark shadow so the text also reads on bright footage (e.g. white shirt)
            ev.append(f"Dialogue: 0,{ts(s)},{ts(e)},KShad,,0,0,0,,{pop}{{\\blur14\\bord9}}" + " ".join(shad_parts))
            # layer 1: a blurred white copy of the text = the soft halo behind the sharp text
            ev.append(f"Dialogue: 1,{ts(s)},{ts(e)},{sty_glow},,0,0,0,,{pop}{{\\blur13\\bord4}}" + " ".join(glow_parts))
            # layer 2: the text itself, softly blurred
            ev.append(f"Dialogue: 2,{ts(s)},{ts(e)},{sty_main},,0,0,0,,{pop}{{\\blur2}}" + " ".join(main_parts))
    path = os.path.join(work, out)
    open(path, "w", encoding="utf-8").write(head + "\n".join(ev) + "\n")
    return path


def build(work, spans, style_id, W, H, out="captions.ass"):
    tr = os.path.join(work, "transcript_edited.json")
    if not os.path.exists(tr):
        die("transcript_edited.json not found (run cut.py first)")
    words = json.load(open(tr, encoding="utf-8"))["words"]
    inspan = lambda t: any(a - 0.05 <= t < b + 0.05 for a, b in spans)  # noqa: E731
    words = [w for w in words if not inspan((w["s"] + w["e"]) / 2)]
    if load_state(work).get("caption_style") == "kold":
        return build_kold(work, words, W, H, out)
    font, size, col, hi, outl, bord, shad, upper = STYLE.get(style_id, STYLE["clean-tech"])
    k = H / 1080
    deva_font = "kalam-700" if font == "kalam-700" else "noto-sans-devanagari-700"
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,CVE {font},{int(size * k)},{ass_color(col)},{ass_color(hi)},{ass_color(outl)},{ass_color('#000000', 0x70)},0,0,0,0,100,100,0,0,1,{bord * k:.1f},{shad * k:.1f},2,{int(120 * k)},{int(120 * k)},{int(90 * k)},1
Style: CapDeva,CVE {deva_font},{int(size * 0.92 * k)},{ass_color(col)},{ass_color(hi)},{ass_color(outl)},{ass_color('#000000', 0x70)},0,0,0,0,100,100,0,0,1,{bord * k:.1f},{shad * k:.1f},2,{int(120 * k)},{int(120 * k)},{int(90 * k)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    groups = chunks(words)
    for gi, g in enumerate(groups):
        texts = [w.get("cap", w["w"]) for w in g]
        if upper:
            texts = [t.upper() for t in texts]
        sty = "CapDeva" if any(DEVA.search(t) for t in texts) else "Cap"
        end_all = g[-1]["e"] + 0.25
        if gi + 1 < len(groups):
            end_all = min(end_all, groups[gi + 1][0]["s"])
        for i, w in enumerate(g):
            s = w["s"] if i else g[0]["s"]
            e = g[i + 1]["s"] if i + 1 < len(g) else end_all
            if e <= s:
                continue
            parts = []
            for j, t in enumerate(texts):
                t = t.replace("{", "(").replace("}", ")")
                parts.append("{\\c" + ass_color(hi) + "}" + t + "{\\c" + ass_color(col) + "}" if j == i else t)
            pop = "{\\fad(60,0)}" if i == 0 else ""
            ev.append(f"Dialogue: 0,{ts(s)},{ts(e)},{sty},,0,0,0,,{pop}" + " ".join(parts))
    path = os.path.join(work, out)
    open(path, "w", encoding="utf-8").write(head + "\n".join(ev) + "\n")
    return path


if __name__ == "__main__":
    work = os.path.abspath(sys.argv[1])
    st = load_state(work)
    H = st.get("height", 1080)
    print(build(work, [], st.get("style", "clean-tech"), int(round(H * 16 / 9 / 2) * 2), H))
