## ADDED Requirements

### Requirement: Correct answer configuration
Poll and yes/no questions SHALL support an optional correct answer and a base point value.

#### Scenario: Configure correctness
- **WHEN** an admin or presenter sets a correct option and base points on a poll or yes/no question
- **THEN** the question persists `correct_index` and `points_base`

#### Scenario: Unscored questions
- **WHEN** a question has no correct option
- **THEN** it is treated as unscored and no points are awarded

### Requirement: Server-authoritative scoring
The server SHALL compute correctness and points when an answer is submitted, using the question activation time for a speed component.

#### Scenario: Correct answer
- **WHEN** a participant answers a scored question correctly
- **THEN** the server awards points scaled by elapsed time since activation, with a minimum positive award

#### Scenario: Incorrect answer
- **WHEN** a participant answers a scored question incorrectly
- **THEN** the server awards zero points

#### Scenario: Missing timing
- **WHEN** a question has no activation timestamp
- **THEN** the server treats elapsed time as zero

### Requirement: Private result feedback
The server SHALL inform the answering participant whether they were correct and how many points they earned.

#### Scenario: Answer result
- **WHEN** a scored answer is accepted
- **THEN** the answering client receives `is_correct`, `points_awarded`, and `total_points`

### Requirement: Activation timestamp
The server SHALL record when a question becomes active to enable speed-based scoring.

#### Scenario: Activate
- **WHEN** a question is activated
- **THEN** its activation timestamp is set to the current time
