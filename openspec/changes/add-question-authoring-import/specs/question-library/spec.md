## ADDED Requirements

### Requirement: Reusable question library
The host SHALL be able to save questions to a library and add them to any event.

#### Scenario: Save to library
- **WHEN** the host saves an event question to the library
- **THEN** a copy is stored and can be found by search

#### Scenario: Add from library
- **WHEN** the host adds a library question to an event
- **THEN** a new draft question is created in that event, independent of the library copy

#### Scenario: Search
- **WHEN** the host searches the library by text
- **THEN** matching prompts are returned
