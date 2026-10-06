## ADDED Requirements

### Requirement: Locked phase hides correctness
While a question is `locked` and not yet revealed, audience and projector clients SHALL NOT display results or the correct answer; the presenter UI MAY still show them.

#### Scenario: Locked rendering
- **WHEN** a question is locked
- **THEN** audience and projector views show no result bars and no correct-answer highlight

#### Scenario: Presenter visibility
- **WHEN** the host opens the presenter panel or admin during the locked phase
- **THEN** the correct answer and result aggregates are visible to the host

### Requirement: Reveal action
The presenter (admin UI or in-slide presenter panel) SHALL be able to reveal a locked question; on reveal the correct answer and results SHALL become visible to every client and the revealed state SHALL survive reconnects.

#### Scenario: Reveal a locked question
- **WHEN** the host reveals a locked question
- **THEN** the question becomes revealed and results plus the correct answer appear on the projector, deck and audience app

#### Scenario: Reveal before the deadline
- **WHEN** the host reveals a live timed question before its deadline
- **THEN** the server locks and reveals it in one action

#### Scenario: Reconnect after reveal
- **WHEN** a client connects or reconnects after reveal
- **THEN** it receives the revealed state with results and correct answer

### Requirement: Deferred correctness disclosure
Points SHALL be scored at answer time, but the submitting participant SHALL NOT learn correctness or awarded points until reveal, unless results are enabled for the question.

#### Scenario: Submit during live or locked
- **WHEN** a participant answers a scorable question while it is live or locked
- **THEN** the response confirms receipt without correctness or awarded points

#### Scenario: Disclosure at reveal
- **WHEN** the question is revealed
- **THEN** each participant sees their own correctness and awarded points

#### Scenario: Results-enabled legacy flow
- **WHEN** the host has enabled results for the question
- **THEN** existing instant-feedback behavior is preserved

### Requirement: Dismiss after reveal
After reveal the presenter SHALL be able to close the question so it leaves the active state, and activating another question SHALL replace it.

#### Scenario: Close a revealed question
- **WHEN** the host closes a revealed question
- **THEN** no active question remains in the live state

#### Scenario: Next question replaces the revealed one
- **WHEN** the host activates a new question
- **THEN** the new question replaces the previous one in the live state
