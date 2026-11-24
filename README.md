# Hinglish Retake Remover

Hinglish audio/podcast/videos mein ghalat ya repeat kiye gaye takes (retakes) apne aap hatane wala chhota tool.

Kayi baar recording ke dauran ek hi dialogue baar baar bola jata hai — pehla take galat hota hai, doosra thoda atakta hai, aur aakhri theek hota hai. Ye project OpenAI Whisper se audio ka transcript nikalta hai, `thefuzz` se milte-julte jumlon ko detect karta hai, aur `pydub` se sirf best (sahe) takes jod kar nayi, saaf MP3 bana deta hai.

## Kaise kaam karta hai

1. Whisper `medium` model se `mera_audio.mp3` ko transcribe kiya jata hai (Hinglish ke liye ye model behtar hai).
2. Har jumle ke aage wale jumlon se 70% se zyada similarity check ki jati hai — matlab ye repeat/retake hai.
3. Har suchh group se sabse zyada confidence (`avg_logprob`) wala take chuna jata hai.
4. Chune gaye takes ko jod kar `saaf_audio.mp3` export kiya jata hai.

## Files

- `app.py` — Poori cleaning logic (Whisper + thefuzz + pydub).
- `requirements.txt` — Python dependencies.
- `README.md` — Ye introduction aur setup guide.

## Setup

> Note: Whisper ko MP3/podcast decode karne ke liye system par **ffmpeg** install hona zaroori hai.

```bash
# 1. Dependencies install karein
pip install -r requirements.txt

# 2. Apni audio file ko app.py ke saath rakhkar naam dein: mera_audio.mp3

# 3. Script chalayein
python app.py
```

Output: `saaf_audio.mp3` — retakes hataye hue saaf audio.

## Customize karna

- **Similarity threshold**: `app.py` mein `similarity > 70` ko badal kar retake detection ko strict ya loose kar sakte hain.
- **Hamesha aakhri take lena hai**: `best_take = max(group, key=lambda x: x["avg_logprob"])` ki jagah `best_take = group[-1]` kar dein.
- **Model badalna hai**: Speed ke liye `base`/`small`, accuracy ke liye `large` use kar sakte hain (`whisper.load_model("medium")` ko edit karein).
- **Apni file ka naam**: `mera_audio.mp3` aur output `saaf_audio.mp3` dono jagahon par badlein.
