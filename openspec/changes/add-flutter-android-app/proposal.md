## Why

The `slides` monorepo pairs Slidev presentations with a Go live-question WebSocket and REST server (`server/`). Audience members joining live quizzes/polls/Q&A and speakers advancing slides or questions from stage benefit from a dedicated Flutter Android companion app with QR join, haptic quiz countdowns, offline vote queueing, and presenter remote controls.

## What Changes

- Add a Flutter Android application under `mobile/` (`xyz.vandijke.slides`) targeting the `server/` Go REST and WebSocket endpoints.
- Implement Audience Mode: QR code scanner (`mobile_scanner`) to join a presentation event, real-time WebSocket question/quiz/reaction participation, countdown timer haptics, and leaderboard viewing.
- Implement Speaker Remote Mode: Host token/login authentication to advance slides/questions, trigger quiz reveals, and moderate audience questions from the phone.
- Add a non-blocking `.github/workflows/flutter-android.yaml` workflow and integrate APK building/publishing into `.releaserc.yaml` and `.github/workflows/release.yaml`.

### Non-goals

- Authoring Slidev Markdown files on the phone.
- Blocking Slidev deck deploys or Docker releases if the Android build fails.

## Capabilities

### New Capabilities

- `flutter-android-app`: Native Flutter Android audience and speaker remote companion for the `slides` Go backend.
- `android-ci-release`: Non-blocking Flutter Android CI workflow and semantic-release GitHub Release APK attachment.

### Modified Capabilities

- None.

## Impact

- New `mobile/` Flutter project directory.
- New `.github/workflows/flutter-android.yaml` workflow.
- Updates to `.releaserc.yaml` and `.github/workflows/release.yaml`.
