# Questions

A question is the unit of audience interaction: it has a **kind**, an optional
**media prompt**, a lifecycle (`draft → live → closed`, with timed questions
locking and revealing), and — for the `poll` and `yes/no` kinds — an **optional**
correct answer and a points value.

Questions are authored in several places, all backed by the same API and the
same store:

- the **presenter panel** inside the deck,
- the **admin panel** (`/admin` → Questions),
- the **API** (`POST /api/admin/events/{id}/questions`),
- **interactive slide layouts** in a deck's `slides.md` (see
  [Interactive slides](decks.md#interactive-slides-markdown-layouts)),
- **markdown comment blocks** in a deck's `slides.md`, imported by the server at
  startup (see
  [Authoring questions in markdown](decks.md#authoring-questions-in-markdown)).

## Question kinds

| Kind | Answer shape | Options? | Scorable | Notes |
| --- | --- | --- | --- | --- |
| `poll` | one option | yes | optional | Pick one from `options` |
| `multi` | JSON array of options | yes | no | Select one or more; duplicates rejected |
| `ranking` | JSON array of all options | yes | no | Rank every option exactly once (Borda scoring) |
| `yesno` | `yes` / `no` | no | optional | Options default to `["yes","no"]` |
| `rating` | `1`–`5` | no | no | Legend-style rating |
| `nps` | `0`–`10` | no | no | Net Promoter Score with distribution + score |
| `open` | free text (≤ 500 chars) | no | no | Open text answer |
| `wordcloud` | free text (≤ 200 chars) | no | no | Aggregated into a word cloud |
| `grid2x2` | `{ "x": 0–1, "y": 0–1 }` | no | no | A point on a 2×2 board (see below) |

!!! tip "Scoring is optional"
    `poll` and `yes/no` *can* carry a correct answer, but they don't have to.
    With **no correct option** the question is a non-scored interaction prompt:
    the live tally still shows, but no points are awarded and there is no
    pass/fail. See
    [Correct answer and scoring](#correct-answer-and-scoring-optional).

!!! note "Answer validation"
    The server normalizes and validates every answer for its kind
    (`db.ValidateAnswer`): `poll` must match an option, `multi` must not contain
    duplicates or unknown options, `ranking` must rank every option exactly once,
    `yesno` must be `yes`/`no`, `rating` must be `1`–`5`, `nps` must be `0`–`10`,
    `grid2x2` must be an object with `x` and `y` in `0`–`1`, and text kinds are
    trimmed and length-checked. Invalid answers are rejected with a helpful
    message.

### Multi-select

Respondents may select any subset of the options. `total` counts **ballots**
(respondents), so bar percentages read as “% of respondents”. The multi-stats
aggregate counts how many respondents selected each option.

### Ranking

Respondents drag all options into an order. Results use [Borda
count](https://en.wikipedia.org/wiki/Borda_count): best rank = 1, and each option
gets `n − rank` points. The results include each option's `score` and
`avg_rank`, ordered by score descending (ties broken by option order).

### NPS

Net Promoter Score asks for a `0`–`10` score. Results return the full 0–10
distribution plus a single `nps` value:

```text
NPS = round(100 × (promoters − detractors) / total)
promoters  = count(9) + count(10)
detractors = count(0..6)
```

### Open text and word cloud

Free-text answers. `open` allows up to 500 characters; `wordcloud` allows up to
200 and is aggregated by token for the word-cloud view. Both are subject to the
[content filter](moderation.md).

### Grid 2×2

The `grid2x2` kind places a dot on a two-axis board. An answer is a JSON object
`{ "x": 0–1, "y": 0–1 }` (both coordinates are required and clamped to the unit
range). Results are **scatter coordinates**: the server rounds each coordinate to
two decimals, merges identical points, and returns them sorted by `x` then `y`,
each with its `count` and its `x`/`y` fields. The `grid2x2` layout renders them
as a quadrant board.

## Options

For `poll`, `multi` and `ranking`, provide a list of options (comma-separated in
the UI, a JSON array through the API):

```json
{
  "kind": "poll",
  "mode": "live",
  "prompt": "Which topic next?",
  "options": ["Kubernetes", "Service mesh", "eBPF", "Platform engineering"]
}
```

- `poll` results preserve option order (zero counts included).
- `multi` results preserve option order too.
- `ranking` results are ordered by Borda score.

`yesno` needs no options (they default to `yes`/`no`). Text, numeric and
`grid2x2` kinds ignore `options` (the grid layout uses `axes` frontmatter for its
labels).

## Media prompts

Any question can carry one **image or video** prompt. Provide either an uploaded
file or a URL:

!!! note "Upload flow"
    Upload the file first with
    `POST /api/admin/events/{id}/questions/media` (multipart form field `file`).
    The response returns `url` (e.g. `/media/<uuid>.png`) and `media_type`
    (`image/png`, `video/mp4`, …). Pass both back on the question.

| Field | Purpose |
| --- | --- |
| `media_url` | Usually a `/media/<uuid>` path; absolute URLs also work |
| `media_type` | `image/…` or `video/…`, drives the renderer |

Accepted upload types (presenter panel and admin form):
`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`,
`video/mp4`, `video/webm` (the admin panel also accepts `video/quicktime`).
Media is served publicly and inline from `/media/{name}` under UUID file names.

## Drafts and the queue

Every question has a `status`:

| Status | Meaning |
| --- | --- |
| `draft` | Saved, not shown to the audience; sits in the queue |
| `live` | Active — the audience sees it and can answer |
| `locked` | A timed question whose deadline passed; answers rejected |
| `revealed` | Correct answer and results published |
| `closed` | Ended by the host (or archived by a deck sync) |

- **Save draft** creates a `draft`.
- **Ask now** creates the question and activates it immediately.
- The **queue** lists drafts in `position` order; **Next →**
  (`POST …/questions/next`) closes the current question and activates the next
  draft.
- Questions can be reordered (`POST …/questions/reorder` with a list of IDs).
- Activating a question always closes any other live/locked/revealed question
  for the event.
- A slide change in the presenter deck auto-activates the matching draft (unless
  its `activate` is `manual`) — see
  [Automatic activation](decks.md#automatic-activation-on-slide-change).

## Correct answer and scoring (optional)

Scoring is **opt-in per question**. The choice kinds that *can* be scored are
`poll` and `yes/no`, and the correct answer itself is **optional**.

Questions are authored in the presenter panel, the admin panel or the API — or
declared in a deck's `slides.md`, either as an interactive slide layout or as a
markdown comment block. See
[Authoring questions in markdown](decks.md#authoring-questions-in-markdown) for
the comment-block fields (including the optional `correct`).

| Field | Default | Meaning |
| --- | --- | --- |
| `correct_index` | `null` (optional) | Index into `options` (for `yesno`: `0` = Yes, `1` = No). `null` means **not scored** |
| `points_base` | `100` | Maximum points per correct answer; only used when the question is scored |

### Non-scored interaction prompts

When a choice question has **no correct option** — `correct_index` is `null` —
it is a **non-scored interaction/feedback prompt** (poll-style). This is the
default for a new question. The audience still answers and the results show
live to spark engagement, but:

- **no points are awarded**,
- there is **no pass/fail** and no correctness, and
- each stored answer has `is_correct` as `NULL`.

To get this behavior, leave **Correct answer** at `— none —` in the presenter
panel's **Quiz scoring** box, pick `— Not scored —` in the admin form, or simply
omit `correct_index` (send it as `null`) through the API.

### Scored questions

Set a correct option to turn a `poll` or `yes/no` question into a scored quiz
round:

- `correct_index` points at an entry in `options` (for `yesno`: `0` = Yes,
  `1` = No).
- `points_base` caps the award (default `100`).

Awards use a **speed bonus**: a correct answer earns up to `points_base`, scaled
by how quickly it was submitted. Points are scored on submission but only
**disclosed at reveal** — unless the question has `show_results` on, which keeps
the legacy instant feedback.

!!! warning "Reveal gates correctness"
    Before reveal, the audience app never learns which option is correct, even
    though the server has already scored and stored the points.

Set `correct_index` (and optionally `points_base`) through the presenter panel's
**Quiz scoring** box, the admin form, or a PATCH to
`/api/admin/events/{id}/questions/{qid}`.

## Timing

Two different durations exist:

| Field | Where | Meaning |
| --- | --- | --- |
| `duration_sec` | question | The auto-close timer (5–180s); `0` = untimed |
| `time_limit_s` | question | The answer **lock** deadline in seconds; `0` = untimed |
| `auto_close` | question | Close the question when `duration_sec` elapses |
| `auto_reveal` | question | Reveal results when the timer expires |

- A **time limit** computed server-side (`activated_at + time_limit_s × 1000`)
  survives reconnects: the client counts down to the same deadline.
- When the deadline passes the question moves to `locked`; late answers are
  rejected and results stay hidden until reveal.
- The background reaper polls for due questions (every second) to auto-close and
  fire `question.closed` webhooks — see [Operations](operations.md).

The `show results` checkbox and `is_feedback` flag complete the per-question
options:

| Option | Default | Meaning |
| --- | --- | --- |
| `show_results` | `true` | Show the live tally to the audience |
| `is_feedback` | `false` | Route the question to the post-event feedback form |

## Feedback forms

Questions flagged **Is feedback** are hidden from the normal question list and
surfaced in the feedback tab. They power the end-of-event feedback form
(`feedback_open` on the event) and the feedback summary in `/admin` → Results.

## Next steps

- [Moderation & safety](moderation.md) — filters and the moderation queue.
- [Decks](decks.md) — the presenter panel, interactive slides and quiz loop.
- [API reference](api.md) — the exact request/response shapes.
