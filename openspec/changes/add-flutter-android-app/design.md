## Context

The `slides` repository includes a Go backend in `server/` providing live WebSocket and REST APIs for interactive presentations (polls, quizzes, Q&A, reactions, slide sync) and uses `semantic-release` in `.github/workflows/release.yaml`.

## Goals / Non-Goals

**Goals:**
- Provide a fast Android app in `mobile/` for audience QR join, live quiz/poll answering, emoji reactions, and speaker slide/question remote control.
- Keep CI and release integration 100% non-blocking (`continue-on-error: true`).

**Non-Goals:**
- Rendering full Slidev Vue components locally when offline.

## Decisions

1. **WebSocket Live Sync + Offline Queue**: Maintain a resilient WebSocket connection to `server/` with local queueing of votes if venue Wi-Fi briefly drops.
2. **Non-Blocking CI & Release**: SHA-pin all GitHub Actions in `.github/workflows/flutter-android.yaml` and `.github/workflows/release.yaml`, set `continue-on-error: true`, and upload `slides-<version>-android.apk` to GitHub Releases.

## Risks / Trade-offs

- **[Conference Wi-Fi Instability]** -> Automatically reconnect WebSocket with exponential backoff and replay queued vote submissions.
