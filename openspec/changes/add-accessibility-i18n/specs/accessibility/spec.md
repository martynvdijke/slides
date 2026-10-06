## ADDED Requirements

### Requirement: Screen-reader announcements
The audience and projector surfaces SHALL announce meaningful state changes to assistive technology.

#### Scenario: Question opens
- **WHEN** a question becomes active
- **THEN** a polite live region announces that the question is open and focus moves to the answer controls

#### Scenario: Lock and reveal
- **WHEN** answers lock or results are revealed
- **THEN** the transition is announced and the results heading receives focus

#### Scenario: No countdown spam
- **WHEN** the countdown ticks
- **THEN** per-second changes are not announced

### Requirement: Keyboard operability
All interactive controls SHALL be reachable and operable by keyboard with visible focus.

#### Scenario: Answer by keyboard
- **WHEN** a keyboard-only participant navigates the audience app
- **THEN** they can select an answer, submit, and reach Q&A without a pointer

### Requirement: Motion preference
The system SHALL respect the user's reduced-motion preference.

#### Scenario: Reduced motion
- **WHEN** the user has `prefers-reduced-motion: reduce`
- **THEN** reaction floats, podium animation and countdown pulsing are replaced with static equivalents

### Requirement: Localized UI chrome
The system SHALL render UI strings in the user's resolved locale, falling back to English.

#### Scenario: Language detection
- **WHEN** a participant opens the app without an override
- **THEN** the UI uses their browser language if a catalog exists, otherwise English

#### Scenario: Per-event override
- **WHEN** the host sets a locale for an event
- **THEN** that event's audience and projector use the override

#### Scenario: Missing key
- **WHEN** a catalog lacks a key
- **THEN** the English string is used
