## Context

Admin mutations are performed across `handlers/admin.go` (events, questions, users, settings, clone, recap, filter, webhooks) with no trail. Participant-related rows live in `participants`, `answers`, `qa_questions`, `qa_votes` and (after `add-persistent-participant-identity`) `participant_profiles`/`profile_events`. The `settings` single-row table is the established place for global configuration, so retention belongs there or in a dedicated settings column set. Media files live on disk under `MEDIA_DIR`/`DECKS_DIR` and are outside the database.

## Goals / Non-Goals

**Goals**
- A trustworthy, append-only record of who did what and when.
- Reversible-by-default data handling: export before erase; erase is explicit and complete for the targeted scope.
- A retention knob that an operator can set, with a documented cleanup.

**Non-Goals**
- Encryption at rest (SQLite file/disk concern), DLP, or legal advice.
- Auditing read-only access or participant actions.
- Sync/export to an external SIEM.

## Decisions

- **Audit table.** `audit_log (id, actor_user_id, actor_username, action, target_type, target_id, metadata JSON, ip, created_at)`. `actor_username` is denormalised so entries survive user deletion. Append-only: no update/delete endpoints; only retention pruning.
- **Recording.** A helper `recordAudit(r, action, targetType, targetID, metadata)` called from the mutating handlers. To avoid missing actions, centralise by wrapping the mutating route groups in an audit middleware that maps method+path→action and captures the response status (record only 2xx mutations). Explicit calls are used where metadata matters (e.g. old/new values).
- **Metadata hygiene.** Never log passwords, session tokens, OIDC secrets or full request bodies; log a whitelist of changed fields.
- **Retention.** `settings.audit_retention_days` and `settings.data_retention_days` (0 = keep forever). A startup + interval cleanup prunes audit rows and, when configured, erases event data older than `data_retention_days`. Erasure is logged as an audit event.
- **Export.** `GET /api/admin/events/{id}/participants/{pid}/export` returns a JSON bundle (participant row, answers, Q&A, votes, profile) — `admin`+ only. A whole-event export is also provided.
- **Erase.** `DELETE /api/admin/events/{id}/participants/{pid}` deletes the participant and cascades answers/Q&A/votes; `DELETE /api/admin/events/{id}/data` erases all audience data for an event. Media files referenced only by erased content are removed on a best-effort basis; the erasure itself is audited.
- **Self-service.** Participant profile deletion (from `add-persistent-participant-identity`) is the participant-facing path; this change adds the admin-facing paths.
- **RBAC alignment.** Audit view and erasure require `admin` (`add-multi-host-rbac`); today that is effectively "any authenticated user", unchanged.

## Risks / Trade-offs

- **Irreversibility.** Erase is destructive; require an explicit confirmation token/flag and log it. Export-before-erase is encouraged.
- **Orphaned media.** File GC is best-effort; document that shared media referenced by multiple events is retained.
- **Growth.** `audit_log` grows unbounded without retention; default to a sensible window (e.g. keep forever initially, operator opt-in to prune).
- **Coverage gaps.** Middleware-based recording plus a test enumerating mutating routes reduces the chance of an unlogged action.
