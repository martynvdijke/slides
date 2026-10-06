## ADDED Requirements

### Requirement: Participant data export
The system SHALL export all data held about a participant on request.

#### Scenario: Export participant
- **WHEN** an administrator exports a participant
- **THEN** a machine-readable bundle of that participant's answers, Q&A, votes and profile is returned

#### Scenario: Export event
- **WHEN** an administrator exports an event's audience data
- **THEN** a machine-readable bundle of the event's audience data is returned

### Requirement: Data erasure
The system SHALL erase participant and event audience data on request.

#### Scenario: Erase participant
- **WHEN** an administrator erases a participant
- **THEN** the participant's answers, Q&A, votes and profile are deleted and the erasure is audited

#### Scenario: Erase event data
- **WHEN** an administrator erases an event's audience data
- **THEN** all audience rows for that event are removed while the event and its questions remain

#### Scenario: Confirmation required
- **WHEN** an erasure is requested without explicit confirmation
- **THEN** the request is rejected and nothing is deleted

### Requirement: Retention
The system SHALL support a configurable retention window for audit and event data.

#### Scenario: Retention configured
- **WHEN** a retention window is set
- **THEN** data older than the window is pruned by the cleanup routine and the pruning is audited

#### Scenario: Keep forever
- **WHEN** retention is unset or zero
- **THEN** nothing is automatically deleted
