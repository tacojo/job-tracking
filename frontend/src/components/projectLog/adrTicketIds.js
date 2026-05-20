import { parseIdNumber } from './sortUtils'

/** Merge ticketIds on the ADR with links from activity-log entries. */
export function buildAdrTicketIdsFromActivity(entries) {
  const map = {}
  for (const entry of entries || []) {
    for (const adrId of entry.adrIds || []) {
      if (!map[adrId]) map[adrId] = new Set()
      for (const tid of entry.ticketIds || []) map[adrId].add(tid)
    }
  }
  const out = {}
  for (const [adrId, set] of Object.entries(map)) out[adrId] = [...set]
  return out
}

export function adrImplementedByTickets(adr, activityIndex) {
  const merged = new Set([...(adr.ticketIds || []), ...(activityIndex[adr.id] || [])])
  return [...merged].sort((a, b) => parseIdNumber(a, 'JAT') - parseIdNumber(b, 'JAT'))
}
