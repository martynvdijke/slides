## 1. Flutter Project Setup (`mobile/`)

- [ ] 1.1 Scaffold Flutter Android project in `mobile/` (`xyz.vandijke.slides`) with `flutter_riverpod`, `dio`, `web_socket_channel`, `mobile_scanner`, `go_router`, and `flutter_secure_storage`.
- [ ] 1.2 Implement server URL onboarding, QR code event scanner, participant identity persistence, and speaker host authentication.

## 2. Audience Live Participation & Speaker Remote

- [ ] 2.1 Implement Audience Live screen with WebSocket sync for polls, timed quizzes, Q&A, live reactions, and quiz leaderboard.
- [ ] 2.2 Implement Speaker Remote control screen to advance slides, open/close questions, reveal quiz answers, and moderate Q&A.
- [ ] 2.3 Add widget and unit tests in `mobile/test/`.

## 3. Non-Blocking CI & Release Integration

- [ ] 3.1 Create `.github/workflows/flutter-android.yaml` with `continue-on-error: true` and SHA-pinned actions.
- [ ] 3.2 Update `.releaserc.yaml` to bump `mobile/pubspec.yaml` and include it in `@semantic-release/git` `assets`.
- [ ] 3.3 Update `.github/workflows/release.yaml` with a non-blocking `android` job that uploads `slides-${VERSION}-android.apk` to the GitHub Release.
- [ ] 3.4 Verify workflows pass `actionlint`, `zizmor`, and `pinact run --check`.
