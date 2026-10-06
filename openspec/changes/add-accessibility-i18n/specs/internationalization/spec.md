## ADDED Requirements

### Requirement: Localized UI chrome
The system SHALL render UI strings in the user's resolved locale, falling back to English.

#### Scenario: Language detection
- **WHEN** a participant opens the app without an override
- **THEN** the UI uses their browser language if a catalog exists, otherwise English

#### Scenario: Per-event override
- **WHEN** the host sets a locale for an event
- **THEN** that event's audience and projector use the override

#### Scenario: Locale listing
- **WHEN** a client requests the available locales
- **THEN** the server returns the codes of the shipped catalogs

#### Scenario: Missing key
- **WHEN** a catalog lacks a key
- **THEN** the English string is used
