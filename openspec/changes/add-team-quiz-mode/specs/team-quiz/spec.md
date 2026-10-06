## ADDED Requirements

### Requirement: Team mode is opt-in per event
The host SHALL be able to enable or disable team competition for an event without affecting individual events.

#### Scenario: Default individual mode
- **WHEN** an event has team mode disabled
- **THEN** the leaderboard and scoring behave exactly as before

#### Scenario: Enable team mode
- **WHEN** the host enables team mode
- **THEN** the live state exposes a team leaderboard and participants can be assigned to teams

### Requirement: Teams can be managed by the host
The host SHALL be able to create, rename, seed and delete teams for an event.

#### Scenario: Create a team
- **WHEN** the host creates a team with a name and optional emoji/color
- **THEN** the team is persisted with a unique join code scoped to the event

#### Scenario: Delete a team
- **WHEN** the host deletes a team
- **THEN** its members become unassigned and no answers are lost

### Requirement: Participants can join a team
Participants SHALL be able to select or join a team and SHALL have their choice reflected in standings.

#### Scenario: Select a team
- **WHEN** a participant selects a team after entering the room
- **THEN** their identity is associated with that team and the team leaderboard updates

#### Scenario: Join by code
- **WHEN** a participant enters a valid team join code
- **THEN** they are added to that team

#### Scenario: No switching after answering
- **WHEN** a participant who has already submitted a scored answer attempts to change teams
- **THEN** the change is rejected and their team is unchanged

### Requirement: Team leaderboard
The system SHALL aggregate member points into a live, ordered team leaderboard.

#### Scenario: Aggregate scoring
- **WHEN** members of a team answer a scored question
- **THEN** the team's total equals the sum of its members' awarded points

#### Scenario: Live update
- **WHEN** a team's total changes
- **THEN** the projector reflects the new standings without a manual refresh

#### Scenario: Unassigned participants
- **WHEN** participants have not joined a team
- **THEN** their points are excluded from team standings and remain visible individually
