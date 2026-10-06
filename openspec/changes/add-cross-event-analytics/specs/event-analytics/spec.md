## ADDED Requirements

### Requirement: Cross-event metrics
The system SHALL provide aggregate metrics across events for a selected date range.

#### Scenario: Dashboard totals
- **WHEN** the host opens analytics for a range
- **THEN** totals for events, participants, answer rate and NPS are shown

#### Scenario: Trend series
- **WHEN** a range spans multiple buckets
- **THEN** participation and NPS are returned as a time series at an appropriate granularity

#### Scenario: Filters
- **WHEN** the host filters by date range or deck
- **THEN** all metrics and the event table reflect the filter

### Requirement: Per-event funnel
The system SHALL show a per-event participation funnel with drop-off.

#### Scenario: Funnel stages
- **WHEN** the host views an event's funnel
- **THEN** joined, engaged, completed and Q&A-interacted counts are shown with drop-off between stages

### Requirement: Export
The system SHALL export the current analytics view as CSV.

#### Scenario: CSV export
- **WHEN** the host exports the event table
- **THEN** a CSV with the same columns and values as the view is downloaded

### Requirement: Aggregates only
The system SHALL NOT expose per-participant data in analytics.

#### Scenario: No individual rows
- **WHEN** analytics is requested
- **THEN** only aggregate values are returned
