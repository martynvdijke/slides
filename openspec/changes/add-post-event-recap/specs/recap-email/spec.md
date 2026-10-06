## ADDED Requirements

### Requirement: Recipient resolution
The recap SHALL be sent to opted-in attendees plus configured host recipients (the admin-configured list and admin users with an email), deduplicated and validated, skipping empty addresses.

#### Scenario: Union and dedupe
- **WHEN** the same address appears among subscriptions and host recipients
- **THEN** the recap is sent to it once

#### Scenario: Empty host emails skipped
- **WHEN** a host account has no stored email
- **THEN** it is skipped without error

#### Scenario: No recipients
- **WHEN** an event has no valid recipients
- **THEN** sending is refused with a clear message before any email is sent

### Requirement: Preview
Admins SHALL be able to preview the rendered recap for an event without sending it.

#### Scenario: Preview
- **WHEN** an admin requests a preview
- **THEN** the server returns the rendered recap text and sends no email

### Requirement: Send with reporting
Sending SHALL require configured SMTP, deliver per recipient, report each recipient's outcome and respect a batch cap.

#### Scenario: Successful send
- **WHEN** SMTP is configured and the admin sends the recap
- **THEN** every valid recipient receives one plain-text email and the response summarizes the deliveries

#### Scenario: Partial failure
- **WHEN** delivery to one recipient fails
- **THEN** remaining recipients are still attempted and the failure is reported per recipient

#### Scenario: SMTP not configured
- **WHEN** SMTP is not configured
- **THEN** the send is refused with a clear error and no email is attempted

#### Scenario: Batch cap
- **WHEN** the recipient list exceeds the cap
- **THEN** the send is limited to the cap and the response reports that it was truncated

### Requirement: Recap content
The recap SHALL include the event name and date, a participation summary, headline results and a link to the results page.

#### Scenario: Content and link
- **WHEN** a recap is rendered
- **THEN** it contains the event summary and a link to the event's results page built from the configured public base URL
