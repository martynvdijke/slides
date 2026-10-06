## ADDED Requirements

### Requirement: Filter configuration
A global blocked-word filter SHALL be configurable from admin settings with an enabled switch, a word list and an action of flag or reject; it SHALL be disabled by default.

#### Scenario: Disabled by default
- **WHEN** the filter has not been configured
- **THEN** every submission is stored as today

#### Scenario: Configure the filter
- **WHEN** an admin enables the filter and saves a word list with the flag action
- **THEN** subsequent matching submissions are flagged

### Requirement: Matching rules
Matching SHALL be case-insensitive and whole-token over normalized text, the list SHALL accept newline or comma separation, and an empty list SHALL match nothing.

#### Scenario: Case-insensitive match
- **WHEN** a blocked token appears in different letter case
- **THEN** it matches

#### Scenario: Whole-token match
- **WHEN** a blocked token appears inside a larger word
- **THEN** it does not match

#### Scenario: Empty list
- **WHEN** the word list is empty
- **THEN** nothing is flagged or rejected

### Requirement: Application scope
The filter SHALL be applied to open-text and word-cloud answer values and Q&A bodies before storage; display names and authors are out of scope.

#### Scenario: Answer filtered
- **WHEN** an open or word-cloud answer matches
- **THEN** the configured action is applied before the answer is stored

#### Scenario: Q&A filtered
- **WHEN** a Q&A body matches
- **THEN** the configured action is applied before the question is stored

### Requirement: Filter actions
With the flag action a matching submission SHALL be stored in a flagged state, excluded from results, and acknowledged as under review; with reject the submission SHALL be refused with an error and store nothing.

#### Scenario: Flag behavior
- **WHEN** a matching submission arrives with the flag action
- **THEN** it is stored flagged, excluded from aggregates, and the submitter is told it is under review

#### Scenario: Reject behavior
- **WHEN** a matching submission arrives with the reject action
- **THEN** it is refused with a clear error and nothing is stored
