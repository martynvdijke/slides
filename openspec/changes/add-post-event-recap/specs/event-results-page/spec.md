## ADDED Requirements

### Requirement: Results publishing control
Each event SHALL have a publish-results switch, off by default, settable by an admin; while off, the public results page and results API SHALL NOT be reachable.

#### Scenario: Publish results
- **WHEN** an admin turns the publish-results switch on
- **THEN** the results page and results API for that event become publicly reachable

#### Scenario: Default unpublished
- **WHEN** an event has never been published
- **THEN** requesting its results page or results API returns not found

#### Scenario: Unpublish
- **WHEN** an admin turns the switch off for a published event
- **THEN** the page and API return not found again

### Requirement: Public results page
The system SHALL serve a public page at `/results/{code}` for a published event, rendering aggregate question results for every kind (including NPS), participation statistics, approved and answered Q&A and the leaderboard.

#### Scenario: Render a published event
- **WHEN** a visitor opens the results page of a published event
- **THEN** they see aggregate results, participation stats, answered Q&A and the leaderboard

#### Scenario: Excluded content
- **WHEN** the event contains pending or hidden Q&A, non-visible answers or draft questions
- **THEN** none of that content appears in the page or its data

#### Scenario: No participant identifiers
- **WHEN** the results data is requested
- **THEN** it contains no participant tokens or internal participant ids

### Requirement: Results pages are not indexed
Results pages SHALL be served with a noindex directive.

#### Scenario: Search engines stay out
- **WHEN** the results page is served
- **THEN** the response carries a noindex directive
