# Redemption Wizard

> **Status:** planned, not yet implemented.
> **Branch:** `feat/redemption-wizard`.
> **Author:** captured 2026-05-12 from a verbal spec; questions marked **CONFIRM** must be answered before coding starts.

## Goal

Multi-step wizard that lets the user create a new redemption issue *directly from the app* — instead of opening Redmine, filling the form, then re-syncing. The wizard:

1. Picks a date or date range for the time off.
2. Lets the user choose which earnings to draw hours from (FIFO suggestion + manual edit, like the existing `RelationLinker`).
3. Confirms the preview, then creates the Redmine issue + time entries + relations atomically.

## Source spec (verbatim user requirements)

- Trigger: a button on the **Redemptions** tab.
- Few-step wizard: (a) date or date range, (b) link earnings (FIFO-proposed), (c) confirmation.
- On confirm:
  - **Project:** "Urlopy" (same project as existing redemptions).
  - **Tracker:** "Odbiór nadgodzin" (the redemption tracker; already in env as `REDMINE_TRACKER_REDEMPTION_ID`).
  - **Subject:** `"Odbiór nadgodzin OB DD.MM"` for one day, `"Odbiór nadgodzin OB DD-DD.MM"` for a same-month range, `"Odbiór nadgodzin OB DD.MM-DD.MM"` cross-month. (`OB` = user initials.)
  - **Assignee:** the current user.
  - **Start date** ("Data rozpoczęcia"): start of redemption.
  - **End date** ("Data oddania"): end of redemption (== start for one-day).
  - **Description:** one line per chosen earning — `Odbiór Xh z #<earning_id>` (Redmine `#NNN` auto-links).
  - **Relations:** one `relates` link per chosen earning, with `allocated_hours = X` so FIFO honors the split.

## Open questions (CONFIRM before coding)

1. **Project resolution.** Is "Urlopy" always the same project ID? Most reliable: add `REDMINE_VACATIONS_PROJECT_ID` env var (single source of truth, no string matching). Existing redemptions in our DB already have `project_id` — quick query at impl start: `SELECT DISTINCT project_id, project_name FROM issues WHERE role = 'redemption'`. **PROPOSAL:** add `REDMINE_VACATIONS_PROJECT_ID` env var, default to whatever the query returns.

2. **User initials.** Where do they come from?
   - **Option A:** new env var `USER_INITIALS=OB` (explicit, predictable).
   - **Option B:** auto-derive from `users/current.json` (firstname[0] + lastname[0]).
   - **PROPOSAL:** Option B with Option A as override (env wins if set).

3. **"Data rozpoczęcia" / "Data oddania" — standard fields or custom fields?** These names are usually Redmine's stock `start_date` / `due_date`. We already mirror those into our `issues` schema (`startDate`, `dueDate`), so they're standard.
   - **PROPOSAL:** treat as standard fields. At impl start, fetch one existing redemption via Redmine API and confirm `start_date`/`due_date` are populated (not custom field IDs). If they're custom fields, fall back to env vars `REDMINE_CF_START_DATE_ID` / `REDMINE_CF_END_DATE_ID`.

4. **Total hours vs per-day hours.** Single-day redemption is typically 8h. A 3-day range is 24h.
   - **PROPOSAL:** wizard computes default = `business_days(start, end) × 8`, user can edit total before going to step 2. Step 2 then distributes that total across selected earnings.

5. **Time entries on the new redemption issue.** Redmine doesn't auto-create time entries when an issue is created. Existing redemptions have `time_entries` rows logged on them — that's how `requested` is calculated. The wizard must create those too.
   - **PROPOSAL:** for each picked earning, create a time entry on the new redemption issue with `hours = allocated`, `spent_on = redemption start_date` (or distribute across days for ranges — open sub-question), `activity_id = ?` (need to know which activity Odbiór uses; likely just standard "Praca" or similar; **CONFIRM** by inspecting an existing redemption's time entries).

6. **Atomicity.** If issue creation succeeds but time entry POST fails, we have a half-created redemption. Redmine doesn't expose transactions across endpoints.
   - **PROPOSAL:** create issue first; if time entry or relation step fails, log a clear error pointing to the issue ID so the user can finish manually in Redmine. Mirror what we have locally with whatever was successfully created. Surface the partial state in the toast.

7. **What if FIFO can't find enough free earnings?** User wants 8h but available is 5h.
   - **PROPOSAL:** wizard step 2 shows a hard validation block — "8h needed, 5h available across selected earnings, add more earnings or reduce hours". Don't let user advance to confirm step.

8. **Refresh after create.** After successful creation, the new issue + time entries + relations exist in Redmine but not locally.
   - **PROPOSAL:** the create endpoint mirrors the new rows directly into our SQLite using the Redmine response (no full sync needed). Then `useRedemption`, `useUnlinked`, `useBalance`, `useEarning`, `useTimeline` are invalidated so the dashboard reflects it immediately.

9. **Description language/format.** "Odbiór Xh z #<earning_id>" — should it be Polish? English? Should it include the earning subject for human readability?
   - **PROPOSAL:** Polish (matches the rest of the workflow): `"Odbiór 4h z #114518 (R&D - support migracji)"`. Keep `#NNN` so Redmine auto-links, append the subject in parens for human readability when scrolling Redmine.

10. **Subject date format edge case.** When the range crosses years (2026-12-30 → 2027-01-02), the spec doesn't cover it.
    - **PROPOSAL:** fall back to ISO range: `"Odbiór nadgodzin OB 2026-12-30 — 2027-01-02"`. Rare enough.

## Architecture

```
┌───────────────────────────┐
│  CreateRedemptionWizard   │ ─ step 1: date range + total hours
│  (multi-step Dialog)      │ ─ step 2: pick earnings + per-earning hours
│                           │ ─ step 3: preview Redmine subject/desc, confirm
└───────────┬───────────────┘
            │ POST /api/redemptions/create
            ▼
┌───────────────────────────┐
│  api: createRedemption()  │
│   1. POST /issues.json     →  Redmine
│   2. POST /time_entries (×N) →  Redmine
│   3. POST /issues/{id}/relations (×N, with allocated_hours) → Redmine + local
│   4. upsert all of the above into local SQLite
└───────────────────────────┘
            │
            ▼ envelope { issueId, url }
            invalidate queries on the client → UI updates instantly
```

## Backend changes

### `apps/api/src/redmine/endpoints.ts`

Add three new endpoints (all already documented in Redmine REST):

- `createIssue(input)` — POST `/issues.json` with `{ project_id, tracker_id, subject, description, assigned_to_id, start_date, due_date, custom_fields? }`. Returns `{ id, url, ...full RedmineIssue }`.
- `createTimeEntry(input)` — POST `/time_entries.json` with `{ issue_id, hours, activity_id, spent_on, comments? }`. Returns the created TE.
- `currentUser()` — wider than the existing `currentUserId()`; returns `{ id, firstname, lastname, login }` so we can derive initials.

### `apps/api/src/config/env.ts`

Add (all optional, validated):

```
REDMINE_VACATIONS_PROJECT_ID   — number (resolved at impl start; mandatory once we know it)
USER_INITIALS                  — 1-6 char string, override for auto-derived initials
REDMINE_CF_START_DATE_ID       — only needed if standard start_date is wrong (CONFIRM #3)
REDMINE_CF_END_DATE_ID         — same
REDMINE_REDEMPTION_ACTIVITY_ID — activity to log time entries against on redemption issues (CONFIRM #5)
```

### `apps/api/src/routes/redemptions.ts` (new file)

```ts
POST /api/redemptions/create
body: {
  startDate: "YYYY-MM-DD",
  endDate:   "YYYY-MM-DD",
  totalHours: number,
  allocations: Array<{ earningId: number; hours: number }>,
}
→ 201 { data: { issueId, url, subject } }
```

Server flow:
1. Validate: `endDate >= startDate`, `sum(allocations.hours) === totalHours`, every `earningId` exists locally as role=earning, every requested `hours <= earning.remaining`.
2. Load current user via `currentUser()`. Compute initials.
3. Build subject from date(s) + initials.
4. Build description from allocations: `"Odbiór " + h + "h z #" + earningId + " (" + subject + ")"` per line.
5. Create issue.
6. Create time entries on the new issue (one per allocation, all with `spent_on = startDate` — keep simple; multi-day spread is a follow-up).
7. Create relations (`relates`) with `allocated_hours = h` per allocation.
8. Upsert everything into local SQLite (issue, time entries, relations).
9. Return envelope.

### `apps/api/src/db/queries.ts`

No changes needed — `fetchRedemptions` and `fetchEarnings` will pick up the new rows once mirrored.

### Tests

- Unit: subject builder (single day / same-month range / cross-month range / cross-year range).
- Unit: initial deriver (firstname/lastname → 2 chars; env override; fallback when missing).
- Unit: validator (allocations sum mismatch, over-cap on an earning, missing earning).
- Integration with MSW: end-to-end create flow, verifying the 3 Redmine POSTs in order.
- Failure case: if time-entry POST fails after issue creation, the partial state is mirrored and the response includes a warning.

## Frontend changes

### New: `apps/web/src/components/redemption-wizard/CreateRedemptionWizard.tsx`

Multi-step `Dialog`. Internal state machine: `"dates" → "earnings" → "preview" → "submitting"`.

**Step 1 — Dates & total**
- Two date inputs: start, end (end defaults to start; locked-equal toggle for "single day").
- "Total hours" input, default = `businessDays(start, end) * 8`. User can edit.
- Disable "Next" until valid + total > 0.

**Step 2 — Earnings**
- Reuse `RelationLinker`'s candidate-list visual idiom, but here the picks have to sum exactly to `totalHours`.
- "Suggest FIFO" auto-picks oldest earnings with capacity until totalHours covered.
- Live `assigned: Xh / required: Yh` indicator. "Next" disabled until equal.

**Step 3 — Preview**
- Shows the future Redmine subject, description, list of relations to be created.
- "Create redemption" submits → POST `/api/redemptions/create`.
- On success: toast with `<Link>` to the new `/issue/$id`, close wizard, invalidate queries.
- On partial failure: toast with the warning + still close so user can inspect in Redmine.

### Modified: `apps/web/src/routes/redemptions.tsx`

Add a primary `<Button>` "New redemption" at the top right of the page header. Click opens the wizard.

### Modified: `apps/web/src/api/mutations.ts`

```ts
useCreateRedemption() — POST /api/redemptions/create
  invalidates: balance, earning, redemption, unlinked, syncHistory, timeline
```

### Tests

- vitest: subject builder (frontend-side preview must match server's choice for step 3 preview parity — share helper from `packages/shared` if possible).
- Playwright smoke: open dialog, fill date, suggest FIFO, advance through preview, click create. Mock the POST so the test doesn't hit real Redmine.

## Phases (proposed order)

1. **Resolve open questions** — query the local DB for existing redemption shape; query Redmine for one existing redemption's full JSON (start_date / due_date / activity_id / project_id). Update env vars; pin custom-field-vs-standard answer.
2. **Backend: endpoints + env** — `createIssue`, `createTimeEntry`, `currentUser`. Wire env vars + tests.
3. **Backend: route** — `POST /api/redemptions/create` with full validation, MSW integration test.
4. **Shared subject builder** — pull into `packages/shared` so frontend preview matches backend output.
5. **Frontend: wizard skeleton** — 3-step dialog with state machine, no submit yet.
6. **Frontend: wire mutation** — POST + invalidations + toast.
7. **Frontend: Redemptions page button** — open the wizard.
8. **E2E** — Playwright spec covering happy path with mocked API.
9. **Manual smoke against `sys.bakk.com`** — create one real redemption (or a test one in a sandbox project), verify subject / fields / description / relations / hours all land correctly. **Don't merge until this passes.**
10. **Update README + memory** — document the new wizard + any new env vars.

## Acceptance criteria

- [ ] "New redemption" button visible on `/redemptions`.
- [ ] Wizard opens; step 1 accepts single day OR range; total hours auto-fills + is editable.
- [ ] Step 2 enforces `sum(picks) == totalHours` before advance; FIFO suggest works.
- [ ] Step 3 preview shows the exact subject + description + relation list that the server will produce.
- [ ] Submit creates a real Redmine issue with correct project, tracker, subject, assignee, start/end dates, description.
- [ ] Time entries are logged on the new issue summing to `totalHours`.
- [ ] `relates` relations are created with `allocated_hours` set per pick.
- [ ] Local DB mirrors all three writes immediately; UI reflects new state without manual sync.
- [ ] Failure modes (Redmine 401/404/500) surface a clear, actionable error.
- [ ] Tests: api ≥ 50 (current 44 + ~6 new), web vitest unchanged or +, playwright +1 spec.
