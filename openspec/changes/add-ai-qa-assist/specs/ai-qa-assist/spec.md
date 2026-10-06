## ADDED Requirements

### Requirement: AI assistance is optional and disabled by default
The system SHALL provide AI Q&A assistance only when an AI provider is configured, and SHALL behave identically to today when it is not.

#### Scenario: Disabled by default
- **WHEN** no AI provider environment variables are set
- **THEN** AI endpoints report that the feature is disabled and the console hides AI controls

#### Scenario: Partially configured
- **WHEN** `AI_ENABLED=true` but the base URL, key or model is missing
- **THEN** the feature remains disabled

### Requirement: Cluster duplicate questions
The system SHALL group an event's visible Q&A into themes of near-duplicate questions.

#### Scenario: Cluster request
- **WHEN** the host requests clustering for an event with questions
- **THEN** each returned theme contains a title and the ids of the questions it groups

#### Scenario: Empty Q&A
- **WHEN** an event has no visible Q&A
- **THEN** clustering returns an empty theme list without calling the provider

#### Scenario: Provider failure
- **WHEN** the provider errors or returns unparseable output
- **THEN** the request reports an error and the host can still read unclustered questions

### Requirement: Presenter digest
The system SHALL produce a short natural-language digest of open questions for the presenter.

#### Scenario: Digest content
- **WHEN** the host requests a digest
- **THEN** a concise summary of the leading themes and the most-upvoted question is returned

#### Scenario: Caching
- **WHEN** a digest is requested repeatedly without the question set changing
- **THEN** the cached result is served within its TTL

### Requirement: Privacy-preserving payloads
The system SHALL send only question text and optional display names to the configured provider.

#### Scenario: No PII leakage
- **WHEN** any AI call is made
- **THEN** participant tokens, cookies and event access codes are not transmitted

#### Scenario: Documented egress
- **WHEN** AI is enabled
- **THEN** the documentation states that question text is sent to the configured provider
