# Project log (tickets & ADRs)

Tracked work and architectural decisions live in JSON under `docs/` and are shown in the app.

## View in the app

Open **Project log** in the header (`/project-log`):

- **Tickets** — `JAT-*` features and enhancements (filter by status and label)
- **ADRs** — `ADR-*` decision records (context, tradeoffs, caveats)
- **Activity** — `LOG-*` minimal session log for recent add/debug work

## Source files

| File | Content |
|------|---------|
| [tickets.json](./tickets.json) | Ticket backlog |
| [adrs.json](./adrs.json) | Architectural decision records |
| [activity-log.json](./activity-log.json) | Session log |
| [LOGGING.md](./LOGGING.md) | How to update (including for Cursor agents) |

## IDs

- **JAT-n** — Job tracker ticket (feature, enhancement, refactor)
- **ADR-n** — Architectural decision record
- **LOG-n** — Activity log entry (minimal, per session)
