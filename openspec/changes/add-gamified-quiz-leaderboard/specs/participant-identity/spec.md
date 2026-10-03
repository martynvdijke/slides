## ADDED Requirements

### Requirement: Identity capture
Participants SHALL be able to set a display identity.

#### Scenario: Set identity
- **WHEN** a participant sends an `identity` message with name, emoji, and color
- **THEN** the server stores it on the participant record

#### Scenario: Sanitization
- **WHEN** an identity is submitted
- **THEN** the name is trimmed and length-limited, and the emoji and color are restricted to allowlists

### Requirement: Identity echo
The state snapshot SHALL include the current participant's identity.

#### Scenario: Reconnect
- **WHEN** a participant loads the event state
- **THEN** the snapshot includes their `me` identity when one is set

### Requirement: Q&A attribution
Q&A entries SHALL display the author's identity when available.

#### Scenario: Attributed question
- **WHEN** an approved question was submitted by an identified participant
- **THEN** it displays with that participant's name, emoji, and color
