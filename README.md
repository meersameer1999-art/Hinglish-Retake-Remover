# Hinglish Retake Remover

Hinglish audio/podcast/videos mein ghalat ya repeat kiye gaye takes (retakes) apne aap hatane wala chhota tool.

Kayi baar recording ke dauran ek hi dialogue baar baar bola jata hai — pehla take galat hota hai, doosra thoda atakta hai, aur aakhri theek hota hai. Ye project OpenAI Whisper se audio ka transcript nikalta hai, `thefuzz` se milte-julte jumlon ko detect karta hai, aur `pydub` se sirf best (sahe) takes jod kar nayi, saaf MP3 bana deta hai.

## Kaise kaam karta hai

1. Whisper `medium` model se `mera_audio.mp3` ko transcribe kiya jata hai (Hinglish ke liye ye model behtar hai).
2. Har jumle ke aage wale jumlon se 70% se zyada similarity check ki jati hai — matlab ye repeat/retake hai.
3. Har suchh group se sabse zyada confidence (`avg_logprob`) wala take chuna jata hai.
4. Chune gaye takes ko jod kar `saaf_audio.mp3` export kiya jata hai.

## Files

- `app.py` — Poori audio-only cleaning logic (Whisper + thefuzz + pydub).
- `scripts/` — Complete audio-first video workflow (self-contained; kisi aur skill folder par depend nahi karta).
- `styles/`, `engine/`, `assets/`, `references/` — Motion graphics render ke liye style library aur engine.
- `WORKFLOW.md` — Editing workflow ki puri guide (steps 5-7: story.js, stills, final render).
- `requirements.txt` — Saari Python dependencies (audio + video dono ke liye).
- `README.md` — Ye introduction aur setup guide.

## Setup (fresh clone ke liye)

> Note: Whisper aur video cutting ke liye system par **ffmpeg** install hona zaroori hai.

```bash
# 1. Dependencies install karein
pip install -r requirements.txt
python scripts/setup.py            # check + missing packages/browser install

# 2. Sirf audio chahiye: apni MP3 ka naam `mera_audio.mp3` rakhein
python app.py                      # output: saaf_audio.mp3

# 3. Raw video chahiye: audio-first pipeline
python scripts/audio_first.py "raw_video.mp4" --lang hi-roman --style warm-canvas --captions no
```

`setup.py --check` sirf report deta hai (kuch install nahi karta). Graphics render ke liye playwright
chromium bhi setup.py hi download karta hai.

## Video editing workflow (audio-first, isi repo mein)

Pipeline bilkul aapke order mein chalti hai:

```
python scripts/audio_first.py "raw_video.mp4" --lang hi-roman --style warm-canvas --captions no
```

1. Raw video se audio extract + Whisper transcription (retake dhoondhne ke liye).
2. Is repo wali logic (`thefuzz.fuzz.ratio`, threshold 70, best/last take, plus intra-segment repeats) se
   retakes + lambi khamoshiyan hatayi jati hain → `WORK/clean_audio.mp3` (final audio) aur
   `WORK/keep_ranges.json` (frame-exact cut map).
3. Us **final audio** par dobara speech-to-text → `WORK/transcript_edited.txt` = saaf script aur scene timings.
4. `cut_from_audio.py` us map se video cut karta hai aur final MP3 ko as-is mux karta hai — video aur audio
   ek hi timeline par rehte hain, desync nahi hota. Output: `WORK/cut.mp4` (raw cut).
5. Phir `WORKFLOW.md` ke steps 5-7: `story.js` → `render.py WORK --check/--stills` → `render.py WORK`
   = `WORK/final.mp4`.

Options: `--threshold 70`, `--intra-threshold 80`, `--keep best|last`, `--pause 0.3`, `--min-gap 0.6`,
`--no-silence`, `--model NAME`, `--skip-stt`, `--no-cut`, `--height 2160`. Hinglish (Roman letters) ke liye
`--lang hi-roman`. Manually koi hissa hatana ho to `WORK/edits.json` mein `{"remove_times": [[start, end]]}`
likh kar `clean_audio.py` + `cut_from_audio.py` dobara chalayein.

Agar aapko sirf audio chahiye (video nahi), to `app.py` waisa hi seedha `saaf_audio.mp3` banata hai.

## Customize karna

- **Similarity threshold**: `app.py` mein `similarity > 70` ko badal kar retake detection ko strict ya loose kar sakte hain.
- **Hamesha aakhri take lena hai**: `best_take = max(group, key=lambda x: x["avg_logprob"])` ki jagah `best_take = group[-1]` kar dein.
- **Model badalna hai**: Speed ke liye `base`/`small`, accuracy ke liye `large` use kar sakte hain (`whisper.load_model("medium")` ko edit karein).
- **Apni file ka naam**: `mera_audio.mp3` aur output `saaf_audio.mp3` dono jagahon par badlein.
