# Feed

The Feed tab displays a chronological list of audio posts (Solos) from all users.

## Features

- Reverse-chronological feed of all Solos
- Topic-based filtering via tag chips
- Audio playback with waveform visualization
- Like and comment interactions (stored locally)
- Pull-to-refresh for new content

## Data Fetching

- Uses TanStack React Query with `queryKey: ['/api/solos']`
- Optional tag filter: `queryKey: ['/api/solos', { tag }]`
- Auto-refetch on window focus
- Optimistic UI updates for likes

## Audio Playback

- Managed by `PlaybackProvider` (single shared audio instance)
- Play/pause/seek/resume controls
- Saved positions per post for resume functionality
- Waveform animation synced to playback progress
