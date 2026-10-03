## ADDED Requirements

### Requirement: Configurable webhook
The host SHALL be able to configure a single outbound webhook from the admin settings.

#### Scenario: Configure
- **WHEN** the host saves a webhook URL, an optional secret, and a set of enabled event types
- **THEN** the settings are persisted and survive a restart

#### Scenario: Disabled by default
- **WHEN** no webhook URL is configured
- **THEN** no outbound requests are made

#### Scenario: Secret not exposed
- **WHEN** the host reads webhook settings
- **THEN** the response indicates whether a secret is set but does not return the secret value

### Requirement: Event notifications
The server SHALL POST a JSON payload to the configured webhook when an enabled event type occurs.

#### Scenario: Q&A created
- **WHEN** an audience member submits a question and `qa.created` is enabled
- **THEN** the server sends a payload describing the event and the question

#### Scenario: Question activated
- **WHEN** a question is activated and `question.activated` is enabled
- **THEN** the server sends a payload identifying the event and question

#### Scenario: Event closed
- **WHEN** an event is closed and `event.closed` is enabled
- **THEN** the server sends a payload identifying the event

#### Scenario: Type filtering
- **WHEN** an event type is not in the enabled set
- **THEN** no request is sent for that type

### Requirement: Signed payloads
The server SHALL sign payloads when a secret is configured.

#### Scenario: Signature header
- **WHEN** a secret is configured and a notification is sent
- **THEN** the request carries an `X-Signature` HMAC-SHA256 of the raw body

### Requirement: Best-effort delivery
Delivery SHALL NOT block or fail the originating operation.

#### Scenario: Receiver unreachable
- **WHEN** the webhook endpoint is slow or errors
- **THEN** the originating request still succeeds and the failure is only logged

#### Scenario: Test action
- **WHEN** the host sends a test
- **THEN** the server posts a sample payload and reports the resulting status without altering event data
