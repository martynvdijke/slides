## ADDED Requirements

### Requirement: Podium toggle
The presenter SHALL be able to show and hide a podium screen, and the flag SHALL be part of the event state so late and reconnecting clients see the same screen.

#### Scenario: Show podium
- **WHEN** the host enables podium mode
- **THEN** every connected client receives state with podium enabled

#### Scenario: Hide podium
- **WHEN** the host disables podium mode
- **THEN** clients return to the normal active-question view

#### Scenario: Reconnect while podium shown
- **WHEN** a client connects while podium mode is active
- **THEN** it renders the podium immediately

### Requirement: Podium content
When podium mode is active the projector and audience app SHALL display the top three participants (gold, silver, bronze) followed by the remaining standings, and a deck component SHALL expose the same state on-slide.

#### Scenario: Top three highlighted
- **WHEN** podium mode is shown and at least three participants have scored
- **THEN** ranks 1–3 are highlighted in order with display name, emoji and points

#### Scenario: Fewer than three participants
- **WHEN** fewer than three participants have scored
- **THEN** only the available entries render, with no empty placeholders

#### Scenario: Deck rendering
- **WHEN** a deck includes the podium component and podium mode is active
- **THEN** the component renders the standings on the slide

### Requirement: Podium cleared on activation
Activating any question SHALL hide podium mode.

#### Scenario: Next question replaces podium
- **WHEN** the host activates a question while podium mode is shown
- **THEN** podium mode turns off and the question is shown instead
