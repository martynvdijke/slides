## ADDED Requirements

### Requirement: Attendee email opt-in
The audience app SHALL let a participant optionally provide an email address to receive the event recap, with explicit consent, stored for that event and participant; providing it SHALL NOT be required to participate.

#### Scenario: Opt in
- **WHEN** a participant submits a valid email with consent
- **THEN** the server stores a subscription for that event and participant and exposes the subscribed state to the client

#### Scenario: Optional
- **WHEN** a participant declines or ignores the email field
- **THEN** they can fully participate without a subscription

#### Scenario: Update email
- **WHEN** a subscribed participant submits a different email
- **THEN** the stored subscription is updated to the new address

### Requirement: Email validation
The server SHALL validate and normalize subscriptions (trim, lowercase, basic format checks, maximum length) and SHALL reject invalid input with a clear error.

#### Scenario: Invalid email
- **WHEN** a participant submits an address that fails validation
- **THEN** the server rejects it with a clear error and stores nothing

### Requirement: Unsubscribe
A participant SHALL be able to remove their subscription, and an admin SHALL be able to remove any subscription for an event.

#### Scenario: Self removal
- **WHEN** a subscribed participant unsubscribes in the audience app
- **THEN** the subscription is deleted and the client state reflects it

#### Scenario: Admin removal
- **WHEN** an admin removes a subscription
- **THEN** the address receives no further recaps for that event

### Requirement: Admin visibility
Admins SHALL be able to list the recap subscriptions of an event with their email and participant display identity.

#### Scenario: List subscriptions
- **WHEN** an admin opens the recap view for an event
- **THEN** the subscribed emails and display identities are listed
