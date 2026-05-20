# Project log — how to update

The **Project log** UI (`/project-log`) reads JSON from this folder. Keep it current when you add features or fix bugs.

## Files

| File | Purpose |
|------|---------|
| `tickets.json` | Features and enhancements (`JAT-*`) — **local only, not in git** |
| `adrs.json` | Architectural decisions (`ADR-*`) — **local only, not in git** |
| `activity-log.json` | Minimal session log (`LOG-*`) — **local only, not in git** |
| `*.sample.json` | Empty templates committed in git; copied to `*.json` on first run if missing |

After a clone, run **Docker** (`docker compose up`) or **local** `npm run dev` in `frontend/` — both run `scripts/ensure-project-log-docs.mjs`, which copies samples only when the real JSON files do not exist (never overwrites your data).

## When to append (required for agents)

After **any** session that implements a feature or fixes/debugs a bug:

1. **`activity-log.json`** — add one entry:
   - `id`: next `LOG-n`
   - `date`: ISO date (`YYYY-MM-DD`)
   - `type`: `feature` | `bugfix` | `debug` | `refactor` | `docs`
   - `summary`: one sentence (what changed, where)
   - `ticketIds`: optional existing or new `JAT-*`
   - `adrIds`: optional if an ADR was added or superseded
   - `components`: e.g. `["backend", "frontend"]`

2. **`tickets.json`** — if work maps to a ticket:
   - Update `status` and `achieved` on an existing ticket, **or**
   - Add a new ticket with the next free `JAT-n` (see `meta.ticketPrefix`).

3. **`adrs.json`** — only when a **durable architectural choice** was made (not every bugfix):
   - New `ADR-n` with `context`, `decision`, `tradeoffs`, `caveats`
   - Mark old ADR `superseded` if replaced.

Do **not** put bug narratives in ADRs; use tickets (`achieved` on fix) and `activity-log.json`.

## Ticket fields

```json
{
  "id": "JAT-147",
  "title": "Short title",
  "status": "done|planned|deferred|rejected|superseded|in-progress",
  "labels": ["feature", "backend"],
  "updated": "2026-05-20",
  "achieved": "One sentence, or null if not done."
}
```

`updated` is **YYYY-MM-DD** (last meaningful change). Sort in the UI uses this date, then id.

`achieved` may also be a **string array** for richer bullet lists (preferred when several decisions or deliverables):

```json
"achieved": [
  "First concrete outcome.",
  "Second outcome or decision.",
  "Caveat or follow-up."
]
```

## Activity log fields

```json
{
  "id": "LOG-6",
  "date": "2026-05-20",
  "type": "bugfix",
  "summary": "Short line shown in the collapsed row",
  "details": ["Bullet one.", "Bullet two."],
  "ticketIds": ["JAT-147"],
  "adrIds": [],
  "components": ["backend"]
}
```

## ADR fields

```json
{
  "id": "ADR-15",
  "title": "Decision title",
  "status": "accepted|proposed|superseded|deprecated",
  "date": "2026-05",
  "updated": "2026-05-20",
  "labels": ["schema"],
  "context": "Why we had to decide.",
  "decision": "What we chose.",
  "tradeoffs": "Pros and cons.",
  "caveats": "What can go wrong or what is still open."
}
```

## Docker and local dev

`docker-compose.yml` mounts `./docs` at `/app/docs` in the frontend container so Vite can import `@docs/*.json`. The frontend entrypoint creates missing `*.json` from `*.sample.json` before starting Vite.

Local (non-Docker) dev uses `../docs` via the same Vite alias; `npm run dev` runs the same bootstrap script as **predev**.

## Human-readable index

See `TICKETS.md` for a short pointer to this system and the UI.
