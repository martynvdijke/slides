## ADDED Requirements

### Requirement: Bulk import with preview
The host SHALL be able to import multiple questions from a text document and preview them before committing.

#### Scenario: Dry run
- **WHEN** the host submits an import with the dry-run option
- **THEN** the parsed questions, their order and any validation warnings are returned without writing to the event

#### Scenario: Commit
- **WHEN** the host commits a valid import
- **THEN** all questions are inserted into the event in document order within a single transaction

#### Scenario: Invalid rows
- **WHEN** some rows fail validation
- **THEN** the host sees per-row errors and, if partial import is chosen, only valid rows are inserted

### Requirement: Supported input formats
The host SHALL be able to import CSV, YAML, JSON and Markdown.

#### Scenario: Format parsing
- **WHEN** a document in a supported format is submitted
- **THEN** its questions map to the same validated draft representation

#### Scenario: Field mapping
- **WHEN** a row specifies kind, prompt, options, correct answer, points or timing
- **THEN** those fields are applied to the created question

### Requirement: Reusable question library
The host SHALL be able to save questions to a library and add them to any event.

#### Scenario: Save to library
- **WHEN** the host saves an event question to the library
- **THEN** a copy is stored and can be found by search

#### Scenario: Add from library
- **WHEN** the host adds a library question to an event
- **THEN** a new draft question is created in that event, independent of the library copy
