# FFmpeg & Transcription Failure Modes

## FFmpeg Failures

### Common Error: "ffmpeg exited with code 1"
**Cause**: Invalid input audio format or corrupted audio data.

**What happens**: The trim or mix step fails. The solo goes to `failed` status.

**Diagnosis**:
1. Check server logs for the solo ID: `grep "solo=XXXXXXXX" logs/`
2. The `processingStep` will be `trim` or `mix`
3. The `processingError` will contain the ffmpeg stderr output

**Common sub-causes**:
- **Empty audio buffer**: Recording was too short or recording failed silently. Check if `audioBuffer.length` is logged as 0KB in processing logs.
- **Unsupported codec**: The device recorded in a codec ffmpeg can't decode. Most common with older Android devices that record in AMR format.
- **Corrupt file header**: Partial upload or network interruption during upload.
- **Trim out of range**: `trimStartSec` or `trimEndSec` exceeds actual audio duration. ffmpeg will error with "Invalid start time" or similar.

### Common Error: "ffmpeg not found" / "spawn ffmpeg ENOENT"
**Cause**: ffmpeg binary is not installed or not in PATH.

**Fix**: Ensure ffmpeg is installed in the Nix environment. Check `which ffmpeg` returns a valid path.

### Trim Step Failures

| Error Pattern | Likely Cause | Fix |
|---|---|---|
| `Invalid start time` | trimStartSec > audio duration | Validate trim bounds before processing |
| `Output file is empty` | Trim range produces 0-length audio | Check trimEndSec > trimStartSec |
| `Permission denied` | Can't write to temp directory | Check `/tmp` is writable |
| `No such file or directory` | Vibe audio file missing | Verify vibes directory has audio files |

### Mix Step Failures

| Error Pattern | Likely Cause | Fix |
|---|---|---|
| `Vibe audio file not found` | Missing vibe file for the selected vibeId | Check `uploads/vibes/` directory |
| `amix: Cannot mix` | Input audio format mismatch | Both audio streams need compatible sample rates |
| `Segmentation fault` | ffmpeg crash on very large files | Check file size limits, consider timeout |

### Performance Notes
- Trim operations on a 5-minute audio file typically take 1-3 seconds
- Mix operations take 2-5 seconds depending on file sizes
- If processing consistently takes > 30 seconds, check server CPU load
- ffmpeg uses temp files in `/tmp` — ensure sufficient disk space

---

## Transcription Failures

### Overview
Transcription uses OpenAI's `gpt-4o-mini-transcribe` model. It runs as the last processing step and is **non-blocking** — if transcription fails, the solo still completes successfully (status becomes `ready`), just without a transcript.

### Common Error: "API key not configured"
**Cause**: The `OPENAI_API_KEY` secret is missing or empty.

**Fix**: Set the OpenAI API key in the Replit Secrets panel. The key is injected via the AI integrations module.

### Common Error: "Rate limit exceeded" / 429 Response
**Cause**: Too many transcription requests in a short period.

**What happens**: The transcription fails but the solo still becomes `ready`. The `transcript` field remains `null`.

**Mitigation**:
- Transcription failures are logged as warnings, not errors
- Users can trigger manual transcription later via `POST /api/solos/:soloId/transcribe`
- Consider implementing a queue with backoff for burst processing

### Common Error: "File too large" / 413 Response
**Cause**: Audio file exceeds OpenAI's upload limit (25MB).

**What happens**: Transcription fails, solo still becomes `ready`.

**Mitigation**: The max recording duration (5 minutes) should keep files under this limit. If files are consistently large, check the audio encoding settings.

### Common Error: "Invalid audio format"
**Cause**: OpenAI's transcription API doesn't support the audio format.

**Supported formats**: mp3, mp4, mpeg, mpga, m4a, wav, webm

**Fix**: Ensure ffmpeg outputs to a supported format. The pipeline saves files as `.webm` by default.

### Transcript Format
When successful, transcripts are stored as JSONB in the `transcript` column with word-level timing:
```json
{
  "words": [
    { "word": "Hello", "start": 0.0, "end": 0.5 },
    { "word": "world", "start": 0.5, "end": 1.0 }
  ]
}
```

### Manual Transcription Retry
If a solo is `ready` but has no transcript:
```
POST /api/solos/:soloId/transcribe
```
This will attempt transcription again without re-processing the audio.

---

## Recovery Playbook

### Scenario: Multiple solos stuck in "processing"
1. List stuck jobs: `GET /api/admin/processing-jobs?status=processing`
2. For each stuck job (> 5 min old), mark as failed:
   `POST /api/admin/processing-jobs/:soloId/fail`
3. Retry each: `POST /api/admin/processing-jobs/:soloId/retry`
4. Monitor logs for the retry attempts

### Scenario: ffmpeg consistently failing
1. Check ffmpeg version: `ffmpeg -version`
2. Test manually: `ffmpeg -i test.webm -t 5 output.webm`
3. Check disk space: `df -h /tmp`
4. Check if vibes directory has valid audio files

### Scenario: All transcriptions failing
1. Check OpenAI API key is set: look for `OPENAI_API_KEY` in secrets
2. Test the API directly: check server logs for 401/403 from OpenAI
3. Check rate limits: look for 429 responses in logs
4. Transcription failures don't block processing — solos will still be `ready`

### Scenario: High retry count on a single solo
1. Get job details: `GET /api/admin/processing-jobs?status=failed`
2. If `attempts >= 3`, the issue is likely systemic (bad audio, missing dependency)
3. Reset the job: `POST /api/admin/processing-jobs/:soloId/reset` (resets attempts to 0)
4. Check the `processingError` for root cause before retrying
