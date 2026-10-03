## ADDED Requirements

### Requirement: Offline buffering
The audience app SHALL buffer answer, vote, and Q&A actions submitted while the WebSocket is disconnected.

#### Scenario: Action while disconnected
- **WHEN** a participant submits an action and the WebSocket is not open
- **THEN** the action is stored locally instead of being dropped

### Requirement: Reconnect flush
The audience app SHALL replay buffered actions in order once the WebSocket reconnects.

#### Scenario: Reconnect
- **WHEN** the WebSocket reopens
- **THEN** buffered actions are sent in the order they were made

#### Scenario: Duplicate suppression
- **WHEN** a buffered action carries a client id already accepted by the server
- **THEN** the duplicate is not applied twice

### Requirement: Haptic confirmation
The audience app SHALL provide haptic feedback on submit where the device supports it.

#### Scenario: Submit success
- **WHEN** an action is accepted
- **THEN** the app triggers a short vibration when supported

#### Scenario: No vibration support
- **WHEN** the device does not support vibration
- **THEN** the app degrades silently without error
