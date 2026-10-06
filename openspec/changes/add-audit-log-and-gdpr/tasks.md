## 1. Data layer

- [ ] 1.1 Add `audit_log` table (append-only) with actor, action, target, metadata JSON, IP, created_at
- [ ] 1.2 Add `settings.audit_retention_days` and `settings.data_retention_days` via `ensureColumn`
- [ ] 1.3 Add `db.RecordAudit/ListAudit/PruneAudit`, and erasure helpers for participant and event audience data
- [ ] 1.4 Tests: append/list/filter, no secrets stored, participant erase cascades, event erase keeps questions, retention pruning

## 2. Recording

- [ ] 2.1 Add `recordAudit` helper; wrap mutating admin route groups with audit middleware (record 2xx only), with explicit calls where field-level metadata matters
- [ ] 2.2 Ensure no credentials/tokens/full bodies are stored; whitelist changed fields
- [ ] 2.3 Route-guard coverage test enumerating mutating routes to assert each is audited

## 3. Endpoints

- [ ] 3.1 `GET /api/admin/audit` (filters) and `GET /api/admin/audit.csv`
- [ ] 3.2 `GET /api/admin/events/{id}/participants/{pid}/export`, `GET /api/admin/events/{id}/export`
- [ ] 3.3 `DELETE /api/admin/events/{id}/participants/{pid}`, `DELETE /api/admin/events/{id}/data` (explicit confirmation)
- [ ] 3.4 Retention settings endpoints; cleanup routine (startup + interval)
- [ ] 3.5 Register routes in `server/main.go`; handler tests for 403/400/confirmation paths

## 4. UI & docs

- [ ] 4.1 `admin.js`/`admin.html`: Audit view (filter + CSV) and privacy controls (export/erase with confirmation)
- [ ] 4.2 README: stored data inventory, retention, erasure, lawful-basis notes

## 5. Verification

- [ ] 5.1 `cd server && go build ./... && go test ./...` and `gofmt -l .` clean
- [ ] 5.2 Manual: perform an action → see it audited; export then erase a participant and confirm removal
