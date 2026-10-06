## ADDED Requirements

### Requirement: Audit record of administrative actions
The system SHALL record administrative mutations in an append-only log.

#### Scenario: Action recorded
- **WHEN** an authenticated user performs a mutating administrative action
- **THEN** an entry with actor, action, target, timestamp and IP is appended

#### Scenario: No secrets logged
- **WHEN** an action involves credentials or tokens
- **THEN** no secret value is stored in the audit entry

#### Scenario: Immutable
- **WHEN** any client attempts to modify or delete an audit entry
- **THEN** the request is rejected; only retention pruning may remove entries

### Requirement: Audit view and export
The system SHALL provide a filterable audit view with CSV export.

#### Scenario: Filter
- **WHEN** the host filters the audit log by actor, action or date
- **THEN** only matching entries are shown

#### Scenario: Export
- **WHEN** the host exports the audit log
- **THEN** a CSV of the filtered entries is downloaded

### Requirement: Participant data export
The system SHALL export all data held about a participant on request.

#### Scenario: Export participant
- **WHEN** an administrator exports a participant
- **THEN** a machine-readable bundle of that participant's answers, Q&A, votes and profile is returned

### Requirement: Data erasure
The system SHALL erase participant and event audience data on request.

#### Scenario: Erase participant
- **WHEN** an administrator erases a participant
- **THEN** the participant's answers, Q&A, votes and profile are deleted and the erasure is audited

#### Scenario: Erase event data
- **WHEN** an administrator erases an event's audience data
- **THEN** all audience rows for that event are removed while the event and its questions remain

### Requirement: Retention
The system SHALL support a configurable retention window for audit and event data.

#### Scenario: Retention configured
- **WHEN** a retention window is set
- **THEN** data older than the window is pruned by the cleanup routine and the pruning is audited

#### Scenario: Keep forever
- **WHEN** retention is unset or zero
- **THEN** nothing is automatically deleted
