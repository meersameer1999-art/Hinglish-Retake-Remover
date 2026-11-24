import whisper
from thefuzz import fuzz
from pydub import AudioSegment

# 1. Whisper model load karein (Hinglish ke liye 'medium' behtar hai)
model = whisper.load_model("medium")

# 2. MP3 file ko transcribe karein
result = model.transcribe("mera_audio.mp3")
segments = result["segments"]

clean_segments = []
i = 0

while i < len(segments):
    current = segments[i]
    group = [current]
    
    # Check karein ke agle jumle is se milte julte hain (Repeated takes)
    j = i + 1
    while j < len(segments):
        similarity = fuzz.ratio(current["text"].lower(), segments[j]["text"].lower())
        if similarity > 70:  # 70% se zyada match matlab repeated dialogue
            group.append(segments[j])
            j += 1
        else:
            break
            
    # 3. Group mein se 'Sahe' take chunein (Aakhri take + High Confidence)
    best_take = max(group, key=lambda x: x["avg_logprob"])
    # Note: Agar aap hamesha aakhri take lena chahein to: best_take = group[-1]
    
    clean_segments.append(best_take)
    i = j

# 4. Sahe takes ko jod kar nayi MP3 file banayein
audio = AudioSegment.from_mp3("mera_audio.mp3")
final_audio = AudioSegment.empty()

for seg in clean_segments:
    start_ms = seg["start"] * 1000
    end_ms = seg["end"] * 1000
    final_audio += audio[start_ms:end_ms]

final_audio.export("saaf_audio.mp3", format="mp3")
print("Kaam mukammal! Saaf audio save ho gayi hai.")
