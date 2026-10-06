## ADDED Requirements

### Requirement: Per-event configuration
Each event SHALL have a Q&A slow mode in seconds (0 = off), settable by an admin.

#### Scenario: Configure slow mode
- **WHEN** an admin sets slow mode to 60 seconds
- **THEN** the setting is stored for that event and shown in the admin editor

#### Scenario: Off by default
- **WHEN** slow mode is 0
- **THEN** submissions are not throttled

### Requirement: Per-participant enforcement
When slow mode is on, a participant's Q&A submission closer than the configured interval since their previous submission SHALL be rejected on both the WebSocket and REST paths with a retry hint; the interval SHALL survive reconnects and server restarts.

#### Scenario: Within the interval
- **WHEN** a participant submits Q&A sooner than the interval
- **THEN** the submission is rejected with a retry hint and nothing is stored

#### Scenario: After the interval
- **WHEN** a participant submits Q&A after the interval has elapsed
- **THEN** the submission is accepted

#### Scenario: Reconnect does not reset
- **WHEN** a participant reconnects and submits within the interval measured from their last stored submission
- **THEN** the submission is still rejected

### Requirement: Audience feedback
The audience app SHALL show the remaining wait after a throttled submission and prevent immediate resubmission.

#### Scenario: Show the wait
- **WHEN** a submission is rejected by slow mode
- **THEN** the audience app displays the remaining seconds before another submission is possible
