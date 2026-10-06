## ADDED Requirements

### Requirement: Time limit configuration
The admin question editor and the in-slide presenter panel SHALL let the host set an optional time limit in seconds on a question, persisted with the question; 0 or empty means untimed.

#### Scenario: Set a time limit
- **WHEN** the host saves a question with a 30-second limit
- **THEN** the question stores a 30-second limit and the live state exposes it

#### Scenario: Untimed default
- **WHEN** a question is created without a time limit
- **THEN** no countdown or auto-lock occurs and behavior matches an untimed question today

#### Scenario: Invalid limit
- **WHEN** the host submits a negative or non-numeric time limit
- **THEN** the server rejects the update with a validation error

### Requirement: Server-authoritative deadline
On activation of a timed question the server SHALL compute a deadline from the activation timestamp and the time limit and SHALL include the deadline in the live state for every client.

#### Scenario: Deadline exposed
- **WHEN** a question with a 30-second limit is activated
- **THEN** the live state exposes a deadline 30 seconds after activation

#### Scenario: Reconnect recovers the countdown
- **WHEN** a client disconnects and reconnects while a timed question is live
- **THEN** the client derives the remaining time from the state deadline

#### Scenario: Untimed question
- **WHEN** the time limit is 0
- **THEN** no deadline is exposed and no auto-lock occurs

### Requirement: Countdown display
Deck components, the projector view and the audience app SHALL display the remaining time for a timed live question and indicate when the time has expired.

#### Scenario: Countdown runs
- **WHEN** a timed question is live
- **THEN** clients show the remaining seconds counting down

#### Scenario: Time expired
- **WHEN** the deadline passes on a client
- **THEN** the countdown shows zero and answer inputs are disabled

### Requirement: Auto-lock at deadline
When the deadline passes the server SHALL transition the question to `locked`, reject subsequent answers and broadcast the change; the transition SHALL be idempotent and recover from a missed timer or server restart.

#### Scenario: Late answer rejected
- **WHEN** an answer for a timed question arrives after its deadline
- **THEN** the server rejects it and stores nothing

#### Scenario: Automatic lock broadcast
- **WHEN** the deadline passes
- **THEN** the question becomes `locked` and all connected clients refresh to the locked state

#### Scenario: Missed timer recovery
- **WHEN** the scheduled lock did not run (for example after a server restart) and a state request or answer arrives after the deadline
- **THEN** the server reconciles the question to `locked` and rejects any late answer
