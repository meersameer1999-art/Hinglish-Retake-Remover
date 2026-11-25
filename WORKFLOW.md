---
name: ai-video-editor
description: Edit a talking-head video end to end for free. Asks a few questions, cuts silent parts and mistakes (auto-detects repeated takes in English/Hindi/Roman Hinglish with Whisper + fuzzy matching, plus manual false starts), adds code-drawn motion graphics in one of 7 Nafay 3D styles, and renders the final MP4. English and Hindi. Use when the user gives a video file and wants it edited, cut, or given motion graphics.
---

# AI Video Editor

Turns a raw talking-head recording into a finished video: silences and mistakes cut, motion graphics in one of
seven styles, sound effects, optional captions, loudness set for YouTube. Everything runs on the user's computer
with free tools: Whisper (faster-whisper) for transcription, ffmpeg for cutting and encoding, headless Chromium
for drawing the graphics. You (the agent) are the editor: you decide the cuts and write the graphics.

`SKILL` below means this skill's folder (the one containing this file). If your tool did not tell you where
it is, look for the first of these that contains `scripts/render.py`: `~/.claude/skills/ai-video-editor`,
`~/.config/opencode/skills/ai-video-editor`, `~/.agents/skills/ai-video-editor`, or the same names
under `.claude/skills`, `.opencode/skills` or `.agents/skills` in the current project. Run scripts with the Python the user has
(`python` on Windows, usually `python3` on macOS/Linux). Quote paths: video paths often contain spaces.
Every script prints JSON or a short report; read it before the next step.

## 0. Setup (first time only)

```
python "SKILL/scripts/setup.py" --check
```
If anything is missing, run `python "SKILL/scripts/setup.py"` (installs faster-whisper, playwright, numpy,
pillow and the headless browser; all free). ffmpeg must be installed separately: the report prints the right
command for the user's OS (Windows: `winget install Gyan.FFmpeg`, macOS: `brew install ffmpeg`). Ask before
installing anything system-wide.

## 1. Ask first

Before touching the video, ask these in one go (use your question tool if you have one, otherwise a short
numbered list). Offer the default in brackets so the user can just say "defaults".

1. **Cut silent parts?** yes / no [yes]. Pace: natural (keeps 0.3 s pauses) or tight (0.15 s) [natural].
2. **Cut mistakes?** Retakes, false starts, repeated lines, "wait let me redo that": yes / no [yes].
   Show the list of mistake cuts for approval first? [yes]
3. **Style** (read `SKILL/styles/index.json`; one line each):
   - Warm Canvas: calm editorial, you stay on screen with serif captions and a PiP canvas of cards. Best default for talking heads.
   - Creator Motion Graphics: punchy kinetic type, dark, high energy.
   - Clean Tech: light, crisp UI cards and kinetic type for tech topics.
   - Software Walkthrough: mock app screens, cursor and clicks for tutorials.
   - Data Story: dark charts and counters for numbers and trends.
   - Chalk Talk: hand-drawn chalkboard for explaining ideas.
   - Pop Info: flat illustrated infographic scenes with a character.
   - Crimson Roadmap: dark cinematic "escape plan" board - pillar-lit step cards, a crimson map with glowing pins, highlighted evidence cards, plus optional AI-image B-roll scenes with glowing word overlays and crimson splash wipes. Best for multi-step plans and blueprints.
   Or "no graphics" (just the cut, with captions if wanted).
4. **Language:** English, Hindi, or a Hindi/English mix [detect].
5. **Captions:** yes / no [no]. For Hindi: Devanagari or Roman letters (Hinglish)?
6. **How much graphics:** light (only the key moments) / medium [light]. Graphics only where they explain something.
7. **Check-ins:** review the graphics plan and stills before the final render? [yes]

If the user gave some answers already, ask only the rest.

## 2. Audio-first pipeline (default for a raw video)

The user's order: **extract audio → remove retakes and silences → final audio → speech-to-text →
script/scenes → cut the video to that final audio**. One command does all of it:

```
python "SKILL/scripts/audio_first.py" "VIDEO" --lang auto|en|hi|hi-roman --style STYLE --captions yes|no
```

This creates `<video name>_edit` (WORK below) and runs, in order:
1. `transcribe.py` on the raw video — original word timings, only used to find retakes.
2. `detect_retakes.py` — the Hinglish-Retake-Remover logic (`Whisper` + `thefuzz.fuzz.ratio`, threshold 70,
   keep the highest-confidence take by default). Writes `WORK/retakes.json` and merges word ranges into
   `WORK/edits.json` without touching manual cuts.
3. `clean_audio.py` — exports `WORK/clean_audio.mp3` (retakes + long silences removed, click-free joins)
   and `WORK/keep_ranges.json`, a frame-exact map of what was kept from the original video.
4. `transcribe.py` on `clean_audio.mp3` — **speech-to-text of the final audio**. Its transcript becomes
   `WORK/transcript_edited.txt/json`: this is the cleaned script and the timeline for visual scenes.
5. `cut_from_audio.py` — cuts the raw video by the frame map and muxes the final MP3 in as-is. Video and
   audio are therefore on exactly the same timeline; there is no re-cutting and no A/V drift. Outputs
   `WORK/cut.mp4` and `WORK/cut_plan.json`.

Options: `--threshold 70` (fuzzy match), `--keep best|last`, `--pause 0.3`, `--min-gap 0.6`,
`--no-silence`, `--model NAME`, `--height 2160`, `--skip-stt` (use the raw-video transcript instead),
`--no-cut` (stop after the audio and script are ready).
Use `--lang hi-roman` for Hinglish spoken in Latin letters; it uses `large-v3-turbo` by default
(about 1.6 GB, slow on CPU — say so before the run). English on CPU uses the much smaller `small.en`.

## 3. Review the mistake cuts (skip if the user said no)

Show the user the `mistake_cuts` list from `WORK/cut_plan.json` (time, reason, exact words removed) and
the `groups` from `WORK/retakes.json` when they asked for check-ins. Also read `WORK/transcript_edited.txt`
for anything fuzzy matching cannot catch:
- **False starts** ("So the main, the key thing is"), redo cues ("wait", "let me say that again"),
  and filler at the edges. Add them as word ranges in `WORK/edits.json` (from/to are indices from the
  original `transcript.txt`, inclusive), then re-run `clean_audio.py` and `cut_from_audio.py`.
- Keep normal informal speech; Hindi fillers like "matlab", "toh", "na" are usually fine. Never reorder lines.

If the user wants different retake behaviour, re-run just `detect_retakes.py WORK --keep last` (or another
`--threshold`), then re-run `clean_audio.py` and `cut_from_audio.py`. Manual cuts in edits.json are preserved.

## 4. Cut (already done by the pipeline)

`cut.mp4` is ready. Only re-run a step if something changed:
- Audio/cut ranges changed: `python "SKILL/scripts/clean_audio.py" WORK` then
  `python "SKILL/scripts/cut_from_audio.py" WORK --style STYLE --captions yes|no`.
- Speech-to-text needs a fix: correct `WORK/transcript_edited.json` (words `"w"`, Roman Hindi `"cap"`)
  and re-render; the cut does not change.
- For the older audio-in-video flow, `cut.py` is still available, but do not use it on a raw video that
  already has `clean_audio.mp3` — that would cut the audio twice.

## 5. Plan the graphics

Read, in this order:
1. `SKILL/references/story-guide.md` (the contract, footage helpers, sound and taste rules). Always.
2. `SKILL/styles/STYLE/style.md` (the look and rules of the style).
3. `SKILL/styles/STYLE/base.js` from the `STYLE:` banner to the end (helpers and the demo scenes to learn from).
4. For Warm Canvas, `SKILL/references/example-story-warm-canvas.js` (a complete working story).
5. `WORK/transcript_edited.txt`.

Pick the beats: the moments where a visual makes the idea clearer (a list, number, comparison, process, key term,
before/after, a named tool). Light = roughly one beat per 30 to 60 seconds; medium = one per 15 to 30 seconds.
Leave the personal and emotional lines on the plain footage. For each beat note: start/end time, the words it
illustrates, what is on screen, how it enters and leaves.

If the user wanted check-ins, show the beat list (a short table) and wait for an OK.

## 6. Write story.js and check it

Write `WORK/story.js` following the guide. Set `EDIT.D` to `cut_seconds` from `WORK/edit.json`. Then:
```
python "SKILL/scripts/render.py" WORK --check
python "SKILL/scripts/render.py" WORK --stills auto
```
Open `WORK/stills/contact.png` (an image; look at it) and fix anything off: clipped or overlapping text, small
type, graphics covering the face, off-style colours, wrong words. Repeat until it looks right. For check-ins,
show the user the contact sheet. Optional live preview with sound:
`python "SKILL/scripts/preview.py" WORK` (run it in the background; it prints a localhost link).

## 7. Render

```
python "SKILL/scripts/render.py" WORK
```
Renders the graphics frames in parallel, the effects, captions (if on), mixes voice and effects, normalizes to
-14 LUFS, and writes `WORK/final.mp4`. Expect a few frames per second of graphics on a laptop; plain footage
costs nothing extra. Options: `--preset slow` (smaller, slightly better file), `--sfx-gain 0.7` (quieter
effects), `--no-captions`, `--height 2160`.

Tell the user where final.mp4 is, how much was cut (from the cut summary), and what graphics were added.

## Fixing things later

- A cut is wrong: edit `edits.json` (or re-run `detect_retakes.py` with another `--threshold`/`--keep`), then
  re-run `clean_audio.py` and `cut_from_audio.py`. If the final audio changed, re-run speech-to-text on the new
  `clean_audio.mp3` (step 2.4) before shifting the story's times; then render again.
- A misheard word in captions: edit its `"w"` in `transcript_edited.json` (or add `"cap"`), render again.
- Hindi captions in Roman letters: add `"cap"` with the Roman spelling to each word in transcript_edited.json.
- Only the graphics changed: edit story.js and run render.py; nothing else needs redoing.

## Limits

- 16:9 videos. Vertical or square sources are center-cropped to 16:9 for now.
- One continuous recording per edit (join clips first with ffmpeg if needed).
