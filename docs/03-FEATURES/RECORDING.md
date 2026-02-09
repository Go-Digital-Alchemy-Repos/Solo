# Recording & Creator Suite

The Creator Suite is Solo's recording interface, accessible from the Record tab.

## Features

### Multi-Segment Recording
- Users can pause and resume recording to create multi-segment audio
- Each segment is captured and concatenated into a single file
- Visual waveform displays real-time audio levels

### Teleprompter
- Optional scrolling text overlay during recording
- Speed calibrated to 160 WPM baseline (1.0x)
- Speed multiplier chips: 0.5x, 1.0x, 1.2x, 1.5x, 2.0x
- Component: `components/Teleprompter.tsx`

### Background Vibes
- Ambient audio tracks mixed into recordings at 10% volume
- Available vibes: Coffee Shop, Nature, Lofi Beat
- Mixing performed server-side via ffmpeg
- Component: `components/VibeSelector.tsx`

### Waveform Trimmer
- Full-width waveform visualization of recorded audio
- Drag handles for setting trim start/end points
- Transcript preview bubble synced to waveform position
- Scrubbing: tap/drag waveform to seek playback position

## Post Flow

1. User records audio with optional teleprompter and vibes
2. Edit screen shows waveform with trim handles, title input
3. User sets title and optionally adjusts trim points
4. "Post" triggers processing screen with pulsing gold animation
5. Server trims audio, mixes vibes, saves file, creates DB record
6. Transcription runs in background via OpenAI
7. App navigates to Feed tab to show the new Solo
