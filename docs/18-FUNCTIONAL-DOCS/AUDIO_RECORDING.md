# Audio Recording

## Overview

Solo's recording system uses `expo-av` for audio capture with multi-segment support, optional teleprompter overlay, and background ambient tracks (vibes).

## Recording Flow

1. User navigates to Record tab
2. Optionally enables teleprompter with script text
3. Optionally selects a background vibe
4. Presses record button to start capturing audio
5. Can pause/resume for multi-segment recording
6. Stops recording to proceed to edit screen

## Edit & Post Flow

1. Edit screen shows full-width waveform visualization
2. User can trim audio using drag handles on the waveform
3. User sets a title for the Solo
4. Optionally adjusts category tags
5. "Post" button triggers the processing pipeline

## Server-Side Processing

1. Audio file is uploaded as multipart form data
2. If trim points are set, ffmpeg trims the audio using `-ss` and `-t` flags
3. If a vibe is selected, ffmpeg mixes the vibe at 10% volume with the voice
4. Processed audio is saved to `uploads/solos/`
5. Solo record is created in the database
6. Background transcription is triggered via OpenAI `gpt-4o-mini-transcribe`

## Technical Details

- Audio format: M4A (AAC)
- Max file size: 50MB
- Vibe mixing: `amix` filter with weights `10 1` (voice 100%, vibe 10%)
- Transcription produces word-level timestamps in JSONB format
