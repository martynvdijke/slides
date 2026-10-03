## ADDED Requirements

### Requirement: Ordered draft queue
The event's draft questions SHALL form an ordered queue by position.

#### Scenario: Queue order
- **WHEN** the host lists questions
- **THEN** draft questions appear in a deterministic order by `position`

#### Scenario: New question joins the queue
- **WHEN** the host creates a new question
- **THEN** it is appended to the end of the queue

### Requirement: Reorder the queue
The host SHALL be able to reorder the queue in one operation.

#### Scenario: Bulk reorder
- **WHEN** the host submits a new order of question ids
- **THEN** the server rewrites their positions to match the submitted order atomically

#### Scenario: Invalid ids
- **WHEN** the submitted order contains an id that does not belong to the event
- **THEN** the server rejects the request and leaves the order unchanged

### Requirement: One-press advance
The presenter SHALL be able to activate the next queued question with a single action.

#### Scenario: Advance
- **WHEN** the presenter presses Next
- **THEN** the next draft in order becomes live and any previously live question is closed

#### Scenario: Empty queue
- **WHEN** the presenter presses Next with no draft remaining
- **THEN** the action is a safe no-op and the presenter is informed the queue is empty

#### Scenario: Concurrent advance
- **WHEN** two Next actions arrive at nearly the same time
- **THEN** only one question is activated

#### Scenario: Skip
- **WHEN** the presenter requests a skip
- **THEN** the current live question is closed without activating the next

### Requirement: Presenter visibility
The admin console and the in-deck presenter panel SHALL show the upcoming queue and a Next control.

#### Scenario: Queue strip
- **WHEN** draft questions exist
- **THEN** the host sees them ordered, with a control to advance

#### Scenario: Unauthenticated panel
- **WHEN** the presenter panel is not authenticated against the backend
- **THEN** the Next control is hidden or disabled rather than failing
