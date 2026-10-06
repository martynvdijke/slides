## ADDED Requirements

### Requirement: Opt-in participant profile
The system SHALL offer an opt-in cross-event profile and SHALL keep participation anonymous when no profile is chosen.

#### Scenario: Anonymous default
- **WHEN** a participant joins without creating a profile
- **THEN** they participate exactly as before and no cross-event record is created

#### Scenario: Create a profile
- **WHEN** a participant saves a display name (with optional emoji/color)
- **THEN** a profile is stored and remembered across events on that device

### Requirement: Prefill returning participants
The system SHALL prefill identity from an existing profile on subsequent joins.

#### Scenario: Prefill on join
- **WHEN** a participant with a stored profile enters a room
- **THEN** their name/emoji/color are prefilled and can be changed before or after joining

#### Scenario: Attribution reuse
- **WHEN** a profiled participant answers or asks a question
- **THEN** their display fields are used for attribution without retyping

### Requirement: Self-service profile access and deletion
The system SHALL let a participant view, export and delete their own profile.

#### Scenario: Delete profile
- **WHEN** a participant deletes their profile
- **THEN** the profile and its cross-event history are erased and the cookie cleared

#### Scenario: Export profile
- **WHEN** a participant requests their profile data
- **THEN** a machine-readable copy is returned

### Requirement: Profile-scoped badges
The system SHALL derive simple engagement badges from profile history.

#### Scenario: Events attended
- **WHEN** a profiled participant has attended multiple events
- **THEN** their events-attended count is available for display
