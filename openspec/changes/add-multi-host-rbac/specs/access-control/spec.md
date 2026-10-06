## ADDED Requirements

### Requirement: Role-based authorization
The system SHALL authorize each administrative action against the user's effective role.

#### Scenario: Insufficient role
- **WHEN** a user without the required role calls an admin endpoint
- **THEN** the request is rejected with 403 and no change is made

#### Scenario: Least privilege
- **WHEN** a user holds only the moderator role
- **THEN** they can moderate Q&A but cannot manage users, settings, webhooks or delete data

#### Scenario: Read-only
- **WHEN** a user holds only the viewer role
- **THEN** they can read stats and results but cannot mutate state

### Requirement: System role ladder
The system SHALL support the ordered roles owner, admin, host, moderator and viewer, and SHALL keep at least one owner.

#### Scenario: Owner protection
- **WHEN** an owner attempts to remove their own owner role while they are the last owner
- **THEN** the change is rejected

### Requirement: Event collaborators
The system SHALL allow a host to grant per-event roles to registered users.

#### Scenario: Invite collaborator
- **WHEN** a host invites a user to an event with a role
- **THEN** that user gains the effective event permission for that role

#### Scenario: Revoke collaborator
- **WHEN** a host removes a collaborator
- **THEN** the user loses the event-scoped permission immediately

#### Scenario: Effective permission
- **WHEN** a user has both a system role and an event role
- **THEN** the higher of the two applies for that event

### Requirement: OIDC group mapping
The system SHALL be able to assign roles from OIDC group membership.

#### Scenario: Group maps to role
- **WHEN** a user signs in via OIDC with a group configured to map to a role
- **THEN** the user is provisioned with that role

#### Scenario: Email allowlist still works
- **WHEN** OIDC group variables are unset
- **THEN** the existing email allowlist behavior is unchanged
