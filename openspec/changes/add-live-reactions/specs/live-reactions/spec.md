## ADDED Requirements

### Requirement: Reaction submission
The audience app SHALL let a participant send an emoji reaction over the event WebSocket.

#### Scenario: Participant taps an emoji
- **WHEN** a participant taps one of the allowed emoji
- **THEN** the client sends a `reaction` WebSocket message with that emoji

#### Scenario: Unsupported emoji
- **WHEN** a reaction arrives with an emoji outside the allowlist (`👏 🔥 ❤️ 😂 🤯 👍`)
- **THEN** the server ignores it

### Requirement: Server aggregation and throttling
The server SHALL aggregate reactions per event and broadcast batched counts, limiting emission per client.

#### Scenario: Batch broadcast
- **WHEN** participants send reactions
- **THEN** the server broadcasts a `reactions` frame with per-emoji counts on roughly a 150ms tick

#### Scenario: Rate limit
- **WHEN** a single client exceeds roughly 5 reactions per second
- **THEN** the server drops the excess reactions silently

#### Scenario: Ephemeral
- **WHEN** reactions are processed
- **THEN** no reaction data is persisted to the database

### Requirement: Projector overlay
The deck SHALL provide a `<LiveReactions />` component that renders incoming reactions as floating emoji.

#### Scenario: Reactions arrive on the projector
- **WHEN** the projector receives a `reactions` frame
- **THEN** the component animates the emoji across the slide without intercepting input

#### Scenario: Bulb-safe rendering
- **WHEN** many reactions arrive at once
- **THEN** the number of simultaneous animated nodes stays bounded

### Requirement: Backward compatibility
Existing decks and clients SHALL continue to work without the reactions feature.

#### Scenario: Older client ignores frames
- **WHEN** a client that does not implement reactions receives a `reactions` frame
- **THEN** it ignores the unknown message type and continues normally
