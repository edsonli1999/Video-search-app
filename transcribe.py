import sys
import faster_whisper

# Load model
model = faster_whisper.WhisperModel('small', device='cpu')

# Get video path from args
video_path = sys.argv[1]

# Transcribe
segments, info = model.transcribe(video_path, beam_size=5)

# Output as JSON or string
transcripts = []
for segment in segments:
    transcripts.append({
        'text': segment.text,
        'start': segment.start,
        'end': segment.end
    })

print(transcripts)
