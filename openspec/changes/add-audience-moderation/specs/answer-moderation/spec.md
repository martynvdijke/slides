## ADDED Requirements

### Requirement: Answer visibility states
Answers SHALL have a visibility state of visible, flagged or hidden, defaulting to visible.

#### Scenario: Default visibility
- **WHEN** an answer contains no blocked content
- **THEN** it is stored visible

### Requirement: Aggregates exclude non-visible answers
All aggregates (live results, projector, results page, CSV exports) SHALL include only visible answers, and moderation changes SHALL refresh live clients.

#### Scenario: Hidden answer disappears
- **WHEN** an admin hides a visible answer
- **THEN** it no longer contributes to aggregates or exports and live clients refresh

#### Scenario: Approved answer returns
- **WHEN** an admin approves a flagged answer
- **THEN** it becomes visible and contributes to aggregates again

#### Scenario: Flagged excluded until approved
- **WHEN** an answer is flagged by the filter
- **THEN** it is excluded from aggregates until an admin approves it

### Requirement: Moderation queue
Admins SHALL be able to list answers for an event or question filtered by visibility state and set an answer to visible (approve or restore) or hidden.

#### Scenario: List flagged answers
- **WHEN** an admin opens the moderation queue
- **THEN** flagged answers are listed first with question prompt, value and submitter display identity

#### Scenario: Moderate an answer
- **WHEN** an admin approves or hides an answer
- **THEN** the answer's state changes and the change is broadcast

#### Scenario: Event scoping
- **WHEN** an admin moderates an answer
- **THEN** the server verifies the answer belongs to the requested event and refuses otherwise
