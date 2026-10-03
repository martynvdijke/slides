## ADDED Requirements

### Requirement: Leaderboard in state
The live state snapshot SHALL include the current top-ranked participants.

#### Scenario: State includes leaderboard
- **WHEN** a client fetches or receives the event state
- **THEN** the snapshot contains up to ten leaderboard entries with rank, name, emoji, color, and points

#### Scenario: Default identity
- **WHEN** a participant has not set a display identity
- **THEN** they appear with a default name, emoji, and color

### Requirement: Live leaderboard updates
The leaderboard SHALL update when scores change.

#### Scenario: Score change
- **WHEN** points are awarded
- **THEN** connected clients receive an updated leaderboard within about a second

### Requirement: Projector leaderboard
The deck SHALL provide a `<Leaderboard />` component that shows the standings.

#### Scenario: Display standings
- **WHEN** the projector renders the leaderboard
- **THEN** it shows ranked participants with their points, degrading gracefully when the leaderboard is empty
