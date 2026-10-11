# Moderation & safety

Slides gives the host three tools to keep a live room clean and on-topic:

1. a global, opt-in **content filter** on free text and Q&A,
2. an **answer moderation queue** for flagged and hidden answers,
3. a per-event **Q&A slow mode**.

## Content filter

The **Content filter** card in `/admin` → Settings holds a global, opt-in word
list. It applies to **open-text and word-cloud answers** and **Q&A bodies**;
**names are never filtered**.

| Setting | Values | Default |
| --- | --- | --- |
| `filter_enabled` / Filter enabled | on / off | off |
| `filter_words` / Blocked words | newline- or comma-separated list | empty |
| `filter_action` / Action on match | `flag`, `reject` | `flag` |

### Matching rules

- Matching is **case-insensitive** and hits **whole tokens**: `badword` catches
  `Badword!` but not `badminton`.
- Entries may be short **phrases**: `you ass` matches consecutive tokens.
- Text is lowercased and split into alphanumeric tokens, so punctuation and
  whitespace are ignored.
- Duplicates and empty entries are dropped.

The two actions:

=== "Flag for review"

    Stores the submission with a `flagged` status and tells the author it is
    under review. It stays out of live results, the projector, exports and the
    leaderboard until approved.

=== "Reject submission"

    Refuses it outright and stores nothing. The author sees an error.

Configure it through the admin panel, or via the API:

```bash
curl -X PUT http://localhost:6270/api/admin/settings/filter \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"enabled":true,"words":"badword\nanother phrase","action":"flag"}'
```

## Answer moderation queue

The **Answer moderation** card sits at the top of the Q&A panel. It lists
answers caught by the content filter or hidden by the host — flagged answers
**first**, with the prompt, the answer and the submitter's display identity.

- Filter the list by **Flagged**, **Hidden**, **Visible** or **All**.
- **Approve**, **Hide** or **Mark answered** each row; every change refreshes
  the connected clients immediately.
- Flagged and hidden answers stay out of live results, the projector, exports and
  the leaderboard until they are approved.

Q&A rows flagged by the filter are sorted first and badged in the normal
moderation list. Answer statuses and Q&A statuses are separate:

| Object | Statuses |
| --- | --- |
| Answer | `visible`, `flagged`, `hidden` |
| Q&A question | `pending`, `approved`, `hidden`, `answered` |

!!! warning "Moderation is a gate, not a delete"
    Hiding or flagging removes an item from public aggregates but keeps the row,
    so the host can reverse the decision. Deleting is a separate action.

## Q&A slow mode

Each event can set a **Q&A slow mode** — the minimum seconds between two
questions from the same participant (`qa_slow_mode_s`, `0` = off).

- Within the interval, a participant's next question is rejected with a retry
  hint (`retry_after_s`).
- The audience app disables the form and shows a live countdown.
- The interval is measured from **stored submissions**, so it survives
  reconnects and server restarts.

Set it in `/admin` → Settings → **Q&A slow mode**, or:

```bash
curl -X PATCH http://localhost:6270/api/admin/events/1 \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"qa_slow_mode_s":30}'
```

## Rejections vs. flags at a glance

| Input | Filter off | Flag | Reject |
| --- | --- | --- | --- |
| Clean answer | visible | visible | visible |
| Blocked answer | visible | stored `flagged`, hidden | 422, nothing stored |
| Clean Q&A | pending | pending | pending |
| Blocked Q&A | pending | pending + flagged badge | rejected |

## Next steps

- [Questions](questions.md) — kinds and validation.
- [Recap & results](recap.md) — what moderation keeps out of the results page.
- [Configuration](configuration.md) — where these settings live.
