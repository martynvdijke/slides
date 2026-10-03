## ADDED Requirements

### Requirement: Clone an event
The host SHALL be able to duplicate an event together with its questions.

#### Scenario: Successful clone
- **WHEN** the host clones an event
- **THEN** a new event is created with the source's name (or an override), description and event date, a fresh unique code and room code, and status open

#### Scenario: Questions copied as drafts
- **WHEN** an event with live and feedback questions is cloned
- **THEN** every source question is copied with its kind, options, prompt, media reference, scoring configuration and timing configuration, but as a draft with runtime state reset

#### Scenario: No audience data copied
- **WHEN** an event with participants, answers, Q&A or votes is cloned
- **THEN** none of that audience data is present in the new event

#### Scenario: Independent events
- **WHEN** the cloned event's questions are later edited or activated
- **THEN** the source event's questions are unaffected

#### Scenario: Unique codes
- **WHEN** a clone is created
- **THEN** its code and room code do not collide with any existing event

### Requirement: Clone from the console
The admin events list SHALL expose a clone action.

#### Scenario: Clone control
- **WHEN** the host views the events list
- **THEN** each event offers a clone action that creates a copy and selects it after success
