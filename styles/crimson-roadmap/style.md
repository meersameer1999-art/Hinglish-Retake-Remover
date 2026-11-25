# Crimson Roadmap (Cinematic Explainer)

## Style card
Name: Crimson Roadmap
Family: Cinematic Explainer
Look: A dark, cinematic "escape plan" board: near-black stage scenes with warm amber light pillars and big serif stage numerals, a crimson journey map with a dotted white route and glowing milestone pins, white news-clipping cards with a yellow highlighter, kraft sticky notes, film grain and slow camera pushes.
How it explains: The map lays out the whole journey first (3 stages, pins popping as the route reaches them), then each stage gets its own pillar-lit card with one evidence prop - a highlighted figure, a sticky-note rule, or a side-by-side comparison - and the finale returns to the map for the last leg to a flag pin, landing on one serif takeaway with a highlighter pill.

## The look
- Surface: near-black base (#0c0909) with a faint crimson corner glow, animated film grain (alpha ~0.05) and a heavy vignette. Map scenes sit on a full-bleed crimson field (#7a0d18) with a radial falloff to #4d0810 at the edges.
- Type: Playfair Display 700 for the big serif stage numerals and the takeaway (the "cinematic" voice); Archivo 700/800 for evidence headlines and stage sub-lines; Instrument Serif italic for card captions and stage-label subtext; IBM Plex Mono 500/600 for every tag, label, source and "MATH:" line, always in caps with wide letter-spacing.
- Color has meaning: crimson #7a0d18 = the world/journey; pin red #e01330 = a milestone; amber #f0a952 = warmth, light pillars and the key multiplier; cream #f6f2e9 = text on dark; yellow highlighter #ffd23f = the one figure that matters; kraft #c9a06a = actionable sticky notes. Never more than three accents on screen at once.
- The map: a white dotted route (4.5px, dash [1,13], round caps) winds across the crimson field on a quadratic-smoothed path through waypoints; glowing red pins (white ring, glyph inside, radial glow) pop with a back-ease as the line reaches them; serif "Stage n" labels with an italic sub-caption sit beside each pin (flip to the left side near the right frame edge).
- Step cards: full-bleed near-black scenes with two warm amber light pillars (26px wide, slow flicker from seeded noise, floor glow ellipse) and a slow Ken Burns push; a mono caps tag above, the big serif stage numeral, then one Archivo sub-line.
- Evidence props: white rounded cards (r~14, soft shadow) float over the scene, slightly rotated (+/-3 degrees); the key figure gets a yellow highlighter swipe drawn FIRST with the text printed OVER it; an italic caption and a mono "MATH:" / "SOURCE:" line sit below.
- Emphasis: one highlighted figure per scene, or one amber multiplier between two white comparison cards; scale-pop with a back ease, never color spam.
- Scene changes: horizontal push cuts (composite + CUTS, direction alternating) between scenes; the map can return as a recap with the final leg of the route drawing to a flag pin. Between a pillar card and an AI-image scene, prefer the crimson splash wipe (below) - it reads like red ink splashing over the frame.
- Image scenes (AI B-roll): cinematic stills in the palette (near-black shadows, warm amber light, crimson accents, film grain, no people unless generic AI stand-ins) play as full-bleed scenes with a slow Ken Burns (cover-fit, zoom 1.12 -> 1.20, a slow seeded pan inside the overscan). Grade the still before text: a dark wash (rgba(12,9,9,0.3)), a crimson radial tint that deepens toward the edges, a dark gradient at the bottom for sub-lines and a soft dark cap at the top for the tag. Over it: a mono caps amber tag at the top, then ONE line of big glowing serif words (Playfair 92px, cream with the final word amber, amber shadow glow ~38px) revealed word by word left to right, then a wide-tracked mono sub-line. One idea per image scene.
- Numbers: only show arithmetic you can defend. Label derived figures "MATH: ..." in mono. If a real-world stat is needed, source it on the card ("SOURCE: ...") or leave it out - ask me instead of guessing.

## Rules that keep it in style
- Change the story, the words and the props; do not change the medium. Recreate the STYLE, not the demo's content - no logos, brand names, real people or copied artwork.
- Every frame is a pure function of t. Use CM.rng(seed) and CM.noise1(seed) for all randomness (pillar flicker, grain offsets), never Math.random. Caching static layers (the GRAIN tile) is fine.
- It will be watched on phones: at 1280x720 keep the serif numerals at 96-124 px, stage sub-lines at ~46 px, card headlines at 24-28 px, mono tags at 18-20 px. Fill the frame; no element clipped at the edges.
- Keep each frame fast, well under 50 ms.
- Give my topic its own demo content; do not reuse the demo's story ("The exact blueprint to escape the Rat Race in 2027") unless my content asks for it.

## The crimson splash wipe (between a card and an image scene)
- A seeded ink-blob wipe: a closed blob (14 points, radius 0.74-1.0 x R, smoothed through midpoints) grows from the frame centre with an inout ease while clipping the incoming scene; over its edge draw a wide translucent crimson band (lineWidth ~8+60*(1-u), shadowBlur ~18+60*(1-u)) plus a thin bright #ff2547 core, both fading out in the last 20% of the cut. Lasts ~0.7 s, gets a deep boom + whoosh in the score. Cover radius R ~1120 from the centre so the corners are always swallowed.

## Image sources (free)
- Stills can come from Pollinations.ai with no API key: `https://image.pollinations.ai/prompt/<urlencoded prompt>?width=1280&height=720&nologo=true&seed=<n>&model=flux`. Free tier allows 1 image per 45 s per IP (HTTP 402 FREE_LIMIT otherwise), so space requests ~50 s apart and retry. The free tier burns a small watermark into the bottom edge - crop the bottom ~4% of the image and resize to 1280x720 before embedding.
- Embed the images as data URIs (`window.__IMG_SRC = { key: 'data:image/jpeg;base64,...' }` in a tiny script right after the page's script opens) so the file stays self-contained; a `loadImgs()` promise fills the IMG map, and the page sets a `window.__imgsReady` flag after the first redraw so frame renderers can wait for it.

## Sound
- Bed: a low dark drone under the intro, then a warm minor pad (padBed, bpm ~76, soft hats) once the map appears.
- Map events to the kit: each pin lands on "boom" with a climbing note (E5, A5, C#6) plus a soft pad note; the route draw gets a long pink-noise sweep; scene cuts get "whoosh"; evidence cards get "pop"; the highlighter gets "marker"; sticky notes get "stamp" then a quiet "shimmer"; counting numbers get rising "tick"s; the biggest number lands on "boom"; the finale flag gets "boom" + "ping"; the takeaway gets a marker swipe and an open chord (A-E-A-C#).
- Full mix (no voiceover): keep at most about 3 sounds at once, and let the pad breathe between stages.
- Sync is everything: the sound score reads the same TL times as the picture.

## Helpers to reuse
- Keep the page, the player (play/pause, scrub, time, sound toggle, loop, Load voiceover) and the CM and SFX blocks unchanged.
- Replace the demo's story: TL, CUTS, the route (WP/STAGES/ROAD), the scene functions, SCENES and scoreSound(). Keep and reuse the style's helpers: background(), GRAIN/grain(), vignette(), cam(), tag(), pillar() + stageHead(), redBG(), route()/routeSeg(), the glyph set (glyphBulb, glyphBook, glyphCoin, glyphFlag), pin(), stageLabel(), softCard(), duoCard(), rise() and the evidence-clipping / kraft-sticky drawing patterns.
- Aim for 15 to 40 seconds unless my content needs more, and set the duration in TL.D.
- Keep window.seek(t), window.DURATION, window.scoreSound and window.SFX exposed, so the video can be rendered frame by frame.
- Load the style's fonts before the first draw, as the reference does: Playfair Display (600/700, italic 600), Archivo (600/700/800), Instrument Serif italic, IBM Plex Mono (500/600).
