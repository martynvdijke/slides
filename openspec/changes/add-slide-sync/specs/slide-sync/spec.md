## ADDED Requirements

### Requirement: Presenter slide broadcast
An authenticated presenter SHALL be able to broadcast the current slide index to all subscribers.

#### Scenario: Presenter navigates
- **WHEN** the authenticated presenter moves to another slide
- **THEN** the client sends a `slide` message with the current index and total, throttled

#### Scenario: Broadcast
- **WHEN** the server receives a valid `slide` message
- **THEN** it broadcasts the slide to every subscriber of that event without forcing a full state rebuild

#### Scenario: Unauthenticated spoofing blocked
- **WHEN** a client without a valid presenter session sends a `slide` message
- **THEN** the server rejects it and does not change the current slide

### Requirement: Slide in state
The state snapshot SHALL include the current slide so late joiners are oriented.

#### Scenario: Late join
- **WHEN** a participant connects after the presenter has moved slides
- **THEN** the initial state includes the current slide index and total

#### Scenario: No slide reported
- **WHEN** no slide has been broadcast
- **THEN** the state omits the current slide and clients hide the indicator

### Requirement: Slide indicator
The audience app and projector SHALL display the current slide unobtrusively.

#### Scenario: Indicator updates
- **WHEN** a `slide` frame arrives
- **THEN** the phone and projector indicators update within about a second

#### Scenario: Reset
- **WHEN** the server restarts and the slide is unknown
- **THEN** the indicator hides until the presenter broadcasts again

### Requirement: Backward compatibility
Clients and decks that do not send or read slide information SHALL keep working unchanged.

#### Scenario: Deck without slide emission
- **WHEN** a deck never sends a `slide` message
- **THEN** all other live features continue to work and the indicator stays hidden

#### Scenario: Client ignoring slide frames
- **WHEN** a client that does not handle `slide` frames receives one
- **THEN** it ignores it without error
