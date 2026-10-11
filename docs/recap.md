# Recap & results

After an event, Slides can publish a public **results page** and email a
**post-event recap** to the host list and to any attendees who opt in.

## Results page

Turn on **Publish results page** in the event settings (`results_published`) to
open a public `/results/{code}` page. It renders:

- participation stats,
- every question's aggregate (including NPS and word clouds),
- the approved/answered Q&A,
- the leaderboard.

It **never** shows participant identities and carries an `X-Robots-Tag: noindex`
directive. While publishing is off, the page and its API
(`GET /api/events/{code}/results`) return **404**.

```bash
# Publish
curl -X PATCH http://localhost:6270/api/admin/events/1 \
  -H 'Content-Type: application/json' -b cookies.txt \
  -d '{"results_published":true}'
```

!!! warning "What stays out"
    Hidden or flagged answers and pending Q&A stay out of the results page, and
    draft questions are skipped. Only `approved` and `answered` Q&A rows appear.

## Attendee email opt-ins

Attendees can opt in to a recap email from the audience app. The address is
stored per event and participant and can be removed by the attendee or the host.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/events/{code}/recap/subscribe` | Store an opt-in (validated, deduped per participant) |
| `POST /api/events/{code}/recap/unsubscribe` | Remove the participant's opt-in |
| `GET /api/admin/events/{id}/recap` | List opt-ins (with display identity) |
| `DELETE /api/admin/events/{id}/recap/{sid}` | Remove one opt-in |

## Recap emails

The **Recap** card in `/admin` → Settings keeps the **host recipient list**
(`recap_emails`), shows the per-event opt-ins, renders a plain-text preview and
sends the recap through the configured SMTP server.

The email contains:

- the event summary and participation numbers,
- headline results,
- top scores,
- Q&A highlights,
- a link to the results page.

| Action | Endpoint | Notes |
| --- | --- | --- |
| Preview | `GET /api/admin/events/{id}/recap/preview` | Never sends; renders text only |
| Send | `POST /api/admin/events/{id}/recap/send` | Sends to the resolved recipient list |

!!! note "Recipient resolution and caps"
    The recipient list is the **union** of the configured host recipients and
    the per-event opt-ins, deduplicated. A single send is capped at **200
    recipients** so synchronous delivery stays predictable. The response reports
    per-recipient success/failure (a `failed` count).

The send targets every recipient through the configured SMTP server. See
[Configuration](configuration.md) for SMTP settings; they can be set in the
admin panel or with `SMTP_*` environment variables (env wins).

## Recap settings

| Setting | Where | Meaning |
| --- | --- | --- |
| `recap_emails` | admin → Settings → Recap | Host recipients, newline/comma separated |
| SMTP host/port/user/password/from/TLS | admin → Settings → Email | Used to deliver the recap and password resets |

## Next steps

- [Configuration](configuration.md) — SMTP and every other option.
- [Moderation & safety](moderation.md) — what is excluded from results.
- [API reference](api.md) — recap endpoints in detail.
