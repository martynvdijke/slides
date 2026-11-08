## ADDED Requirements

### Requirement: Audience QR join and live WebSocket quiz/poll participation
The Flutter Android app SHALL let participants join a presentation session via QR code or code entry, receive real-time question/quiz/slide updates over WebSocket, submit answers and reactions, and view the live leaderboard.

#### Scenario: Join presentation and answer timed quiz
- **WHEN** a participant scans the presentation QR code and the host starts a timed quiz question
- **THEN** the app displays the countdown timer and answer choices, submits the participant's selection, and updates their score on reveal

### Requirement: Speaker remote control mode
The app SHALL allow an authenticated host to advance slides, activate or close questions, reveal quiz results, and highlight Q&A submissions from their Android phone.

#### Scenario: Speaker advances slide and activates poll
- **WHEN** the host taps "Next Slide" or activates a queued question in Speaker Remote Mode
- **THEN** the server broadcasts the state change to the main presentation display and all connected participants
