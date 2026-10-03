## ADDED Requirements

### Requirement: Generate an event report
The host SHALL be able to generate a shareable HTML summary of an event's results.

#### Scenario: Report contents
- **WHEN** the host opens the event report
- **THEN** the document shows event metadata, per-question results, feedback summary, Q&A, and the leaderboard when scoring was used

#### Scenario: Correct answer marking
- **WHEN** a scored question has results revealed
- **THEN** the correct option is indicated in the report

#### Scenario: No audience identifiers
- **WHEN** the report is generated
- **THEN** it contains no participant tokens or raw ids beyond leaderboard display names and Q&A authors already visible to the host

#### Scenario: Safe rendering
- **WHEN** question prompts, options, Q&A bodies or names contain HTML metacharacters
- **THEN** they are escaped in the output and cannot inject markup or scripts

#### Scenario: Empty event
- **WHEN** an event has no answers or Q&A
- **THEN** the report still renders a valid document with an empty-state note

### Requirement: Report access
The report SHALL be restricted to authenticated hosts and reachable from the console.

#### Scenario: Auth required
- **WHEN** an unauthenticated request hits the report endpoint
- **THEN** it is rejected

#### Scenario: Console action
- **WHEN** the host views the results panel
- **THEN** a report action opens the generated document
