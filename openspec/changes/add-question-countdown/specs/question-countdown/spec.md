## ADDED Requirements

### Requirement: Per-question timer configuration
The host SHALL be able to set an optional countdown duration on a question, with optional auto-close and auto-reveal.

#### Scenario: Host sets a duration
- **WHEN** the host creates or edits a question with a duration in the allowed range (5–180 seconds)
- **THEN** the question stores `duration_sec`, `auto_close`, and `auto_reveal`

#### Scenario: Invalid duration
- **WHEN** the host submits a duration outside 0 (untimed) or 5–180
- **THEN** the server rejects the change

#### Scenario: Untimed question
- **WHEN** a question has `duration_sec = 0`
- **THEN** it behaves exactly as before: no countdown, no automatic close

### Requirement: Server-authoritative expiry
The server SHALL derive a question's deadline from its activation time and duration, and expose it to clients.

#### Scenario: Activation starts the clock
- **WHEN** a timed question is activated
- **THEN** its deadline is `activated_at + duration_sec`, and the active-question payload includes `expires_at` and `remaining_sec`

#### Scenario: Late joiner
- **WHEN** a participant joins while a timed question is live
- **THEN** the state payload gives them the correct remaining time based on server time

#### Scenario: Restart resilience
- **WHEN** the server restarts while a timed question is live
- **THEN** the question still expires at the originally scheduled time

### Requirement: Automatic close and optional reveal
The server SHALL close a timed question when its deadline passes, and reveal results when auto-reveal is enabled.

#### Scenario: Auto-close
- **WHEN** a timed question passes its deadline
- **THEN** the server closes it and broadcasts a state refresh so no further answers are accepted

#### Scenario: Auto-reveal
- **WHEN** a question with `auto_reveal` enabled closes on expiry
- **THEN** its results are shown to the audience and projector

#### Scenario: Manual close still works
- **WHEN** the host closes a timed question before its deadline
- **THEN** it closes immediately and the timer is cancelled

### Requirement: Countdown UI
The audience app, projector, and deck SHALL display a countdown for the active timed question.

#### Scenario: Countdown visible
- **WHEN** the active question has remaining time
- **THEN** the phone, projector, and slide each show a countdown that decrements locally and resyncs on each state update

#### Scenario: Expired
- **WHEN** the countdown reaches zero
- **THEN** the surfaces stop accepting input and wait for the refreshed state

### Requirement: Backward compatibility
Questions without a duration, and older decks that do not read the new fields, SHALL keep working unchanged.

#### Scenario: Older deck
- **WHEN** a deck that does not read the countdown fields is projected
- **THEN** it still renders the active question and results as before

#### Scenario: Untimed question state
- **WHEN** an untimed question is active
- **THEN** its payload omits a meaningful deadline and clients show no countdown
