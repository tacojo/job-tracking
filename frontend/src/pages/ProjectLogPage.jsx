import { useEffect, useMemo, useState } from 'react'
import ticketsData from '@docs/tickets.json'
import adrsData from '@docs/adrs.json'
import activityData from '@docs/activity-log.json'
import { PageHeader } from '../components/ui'
import DetailBullets, { formatLogDate } from '../components/projectLog/DetailBullets'
import LogRowHeader from '../components/projectLog/LogRowHeader'
import LogItemCopyLine from '../components/projectLog/LogItemCopyLine'
import LogListHeadings from '../components/projectLog/LogListHeadings'
import LogRowBadge, { statusVariant } from '../components/projectLog/LogRowBadge'
import {
  DEFAULT_SORT,
  sortItems,
  toggleSortColumn,
} from '../components/projectLog/sortUtils'
import { adrImplementedByTickets, buildAdrTicketIdsFromActivity } from '../components/projectLog/adrTicketIds'

function detailText(value) {
  if (Array.isArray(value)) return value.join(' ')
  return value || ''
}

const PAGE_SIZE = 10

function ticketUpdated(t) {
  return t.updated || ticketsData.meta.updated
}

function adrUpdated(a) {
  return a.updated || a.date
}

const PAGINATION_BTN = 'btn btn-outline-secondary btn-sm project-log-pagination__btn'

function PaginationBar({ page, totalPages, totalItems, onPageChange }) {
  if (totalItems === 0) return null
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, totalItems)

  return (
    <div className="project-log-pagination mt-3">
      <div className="project-log-pagination__start">
        <button
          type="button"
          className={PAGINATION_BTN}
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          First
        </button>
        <span className="small text-body-secondary ms-2">
          {from}–{to} of {totalItems}
        </span>
      </div>
      <div className="project-log-pagination__center" role="group" aria-label="Page navigation">
        <button
          type="button"
          className={PAGINATION_BTN}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className={`${PAGINATION_BTN} disabled text-nowrap`}>
          {page}/{totalPages}
        </span>
        <button
          type="button"
          className={PAGINATION_BTN}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
      <div className="project-log-pagination__end">
        <button
          type="button"
          className={PAGINATION_BTN}
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          Last
        </button>
      </div>
    </div>
  )
}

function FilterBar({
  statusOptions,
  labelOptions,
  status,
  setStatus,
  label,
  setLabel,
  search,
  setSearch,
  searchPlaceholder,
  statusLabel = 'Status',
  searchLabel = 'Id / title',
  labelFilterLabel = 'Label',
}) {
  return (
    <div className="row g-2 mb-2 align-items-end">
      <div className="col-md-4">
        <label className="form-label form-label-sm mb-1">{statusLabel}</label>
        <select className="form-select form-select-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="col-md-4">
        <label className="form-label form-label-sm mb-1">{searchLabel}</label>
        <input
          type="search"
          className="form-control form-control-sm"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="col-md-4">
        <label className="form-label form-label-sm mb-1">{labelFilterLabel}</label>
        <select className="form-select form-select-sm" value={label} onChange={(e) => setLabel(e.target.value)}>
          <option value="">All</option>
          {labelOptions.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ExpandableList({ items, expandedId, onToggle, renderHeader, renderBody }) {
  if (items.length === 0) {
    return <p className="small text-body-secondary mb-0 py-3 px-3">No items match your filters.</p>
  }

  return (
    <div className="list-group list-group-flush project-log-list">
      {items.map((item) => {
        const open = expandedId === item.id
        return (
          <div key={item.id} className={`list-group-item p-0 border-0 ${open ? 'project-log-list__item--open' : ''}`}>
            <button
              type="button"
              className={`w-100 btn text-start py-2 px-3 project-log-list__trigger ${open ? 'project-log-list__trigger--open' : ''}`}
              onClick={() => onToggle(item.id)}
              aria-expanded={open}
            >
              {renderHeader(item, open)}
            </button>
            {open ? (
              <div className="px-3 pb-3 pt-0 small border-top project-log-list__body">{renderBody(item)}</div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function usePaginatedList(filtered) {
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
    setExpandedId(null)
  }, [filtered])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id))

  return {
    pageItems,
    page: safePage,
    totalPages,
    setPage,
    expandedId,
    toggle,
  }
}

function TicketsTab() {
  const [status, setStatus] = useState('')
  const [label, setLabel] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState(DEFAULT_SORT)

  const allLabels = useMemo(() => {
    const set = new Set()
    ticketsData.tickets.forEach((t) => t.labels?.forEach((l) => set.add(l)))
    return [...set].sort()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = ticketsData.tickets.filter((t) => {
      if (status && t.status !== status) return false
      if (label && !t.labels?.includes(label)) return false
      if (q) {
        const hay = `${t.id} ${t.title} ${detailText(t.achieved)} ${t.labels?.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return sortItems(list, sort, { prefix: 'JAT', getUpdated: ticketUpdated })
  }, [status, label, search, sort.field, sort.dir])

  const { pageItems, page, totalPages, setPage, expandedId, toggle } = usePaginatedList(filtered)

  const counts = useMemo(() => {
    const c = {}
    ticketsData.statuses.forEach((s) => {
      c[s] = ticketsData.tickets.filter((t) => t.status === s).length
    })
    return c
  }, [])

  return (
    <>
      <p className="text-body-secondary small mb-2">
        Updated {ticketsData.meta.updated} · <code>docs/tickets.json</code> · click a row to see what was achieved
      </p>
      <div className="d-flex flex-wrap gap-1 mb-2">
        {ticketsData.statuses.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn btn-sm py-0 ${status === s ? `btn-${statusVariant(s)}` : 'btn-outline-secondary'}`}
            onClick={() => setStatus(status === s ? '' : s)}
          >
            {s} ({counts[s] ?? 0})
          </button>
        ))}
      </div>
      <FilterBar
        statusOptions={ticketsData.statuses}
        labelOptions={allLabels}
        status={status}
        setStatus={setStatus}
        label={label}
        setLabel={setLabel}
        search={search}
        setSearch={setSearch}
        searchPlaceholder="Search id, title, achieved…"
      />
      <div className="card section-card">
        <LogListHeadings
          sort={sort}
          onSortId={() => setSort((s) => toggleSortColumn(s, 'id'))}
          onSortUpdated={() => setSort((s) => toggleSortColumn(s, 'updated'))}
        />
        <ExpandableList
          items={pageItems}
          expandedId={expandedId}
          onToggle={toggle}
          renderHeader={(t) => (
            <LogRowHeader
              status={t.status}
              statusVariant={statusVariant(t.status)}
              id={t.id}
              title={t.title}
              labels={t.labels}
              date={formatLogDate(ticketUpdated(t))}
            />
          )}
          renderBody={(t) => (
            <>
              <p className="text-body-secondary small mb-1">
                Last updated: {formatLogDate(ticketUpdated(t))}
              </p>
              <LogItemCopyLine id={t.id} title={t.title} />
              <p className="fw-semibold mb-2">Achieved</p>
              <DetailBullets value={t.achieved} />
            </>
          )}
        />
      </div>
      <PaginationBar page={page} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
    </>
  )
}

const adrActivityTicketIndex = buildAdrTicketIdsFromActivity(activityData.entries)

function AdrsTab() {
  const [status, setStatus] = useState('')
  const [label, setLabel] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState(DEFAULT_SORT)

  const allLabels = useMemo(() => {
    const set = new Set()
    adrsData.adrs.forEach((a) => a.labels?.forEach((l) => set.add(l)))
    return [...set].sort()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = adrsData.adrs.filter((a) => {
      if (status && a.status !== status) return false
      if (label && !a.labels?.includes(label)) return false
      if (q) {
        const tickets = adrImplementedByTickets(a, adrActivityTicketIndex).join(' ')
        const hay = `${a.id} ${a.title} ${tickets} ${a.context} ${a.decision} ${a.tradeoffs} ${a.caveats}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return sortItems(list, sort, { prefix: 'ADR', getUpdated: adrUpdated })
  }, [status, label, search, sort.field, sort.dir])

  const { pageItems, page, totalPages, setPage, expandedId, toggle } = usePaginatedList(filtered)

  return (
    <>
      <p className="text-body-secondary small mb-2">
        <code>docs/adrs.json</code> · click a row for context, decision, tradeoffs, and caveats
      </p>
      <FilterBar
        statusOptions={adrsData.statuses}
        labelOptions={allLabels}
        status={status}
        setStatus={setStatus}
        label={label}
        setLabel={setLabel}
        search={search}
        setSearch={setSearch}
        searchPlaceholder="Search ADR id, title, decision…"
      />
      <div className="card section-card">
        <LogListHeadings
          sort={sort}
          onSortId={() => setSort((s) => toggleSortColumn(s, 'id'))}
          onSortUpdated={() => setSort((s) => toggleSortColumn(s, 'updated'))}
        />
        <ExpandableList
          items={pageItems}
          expandedId={expandedId}
          onToggle={toggle}
          renderHeader={(a) => (
            <LogRowHeader
              status={a.status}
              statusVariant={statusVariant(a.status)}
              id={a.id}
              title={a.title}
              labels={a.labels}
              date={formatLogDate(adrUpdated(a))}
            />
          )}
          renderBody={(a) => {
            const implementedBy = adrImplementedByTickets(a, adrActivityTicketIndex)
            return (
            <>
              <p className="text-body-secondary small mb-2">
                Last updated: {formatLogDate(adrUpdated(a))}
              </p>
              {implementedBy.length > 0 ? (
                <>
                  <p className="fw-semibold mb-1">Implemented by</p>
                  <div className="d-flex flex-wrap gap-1 mb-3">
                    {implementedBy.map((tid) => (
                      <LogRowBadge key={tid} text={tid} variant="primary" />
                    ))}
                  </div>
                </>
              ) : null}
              <dl className="mb-0 project-log-dl">
                <dt>Context</dt>
                <dd>{a.context}</dd>
                <dt>Decision</dt>
                <dd>{a.decision}</dd>
                <dt>Tradeoffs</dt>
                <dd>{a.tradeoffs}</dd>
                <dt>Caveats</dt>
                <dd className="mb-0">{a.caveats}</dd>
              </dl>
            </>
            )
          }}
        />
      </div>
      <PaginationBar page={page} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
    </>
  )
}

function ActivityTab() {
  const [sort, setSort] = useState(DEFAULT_SORT)

  const sorted = useMemo(
    () =>
      sortItems(activityData.entries || [], sort, {
        prefix: 'LOG',
        getUpdated: (e) => e.date,
      }),
    [sort.field, sort.dir]
  )

  const { pageItems, page, totalPages, setPage, expandedId, toggle } = usePaginatedList(sorted)

  return (
    <>
      <p className="text-body-secondary small mb-2">
        Session log · <code>docs/LOGGING.md</code>
      </p>
      <div className="card section-card">
        <LogListHeadings
          sort={sort}
          onSortId={() => setSort((s) => toggleSortColumn(s, 'id'))}
          onSortUpdated={() => setSort((s) => toggleSortColumn(s, 'updated'))}
        />
        <ExpandableList
          items={pageItems}
          expandedId={expandedId}
          onToggle={toggle}
          renderHeader={(e) => (
            <LogRowHeader
              status={e.type}
              statusVariant={statusVariant(e.type)}
              id={e.id}
              title={e.summary}
              labels={e.components}
              date={formatLogDate(e.date)}
            />
          )}
          renderBody={(e) => (
            <>
              <p className="text-body-secondary small mb-2">
                Last updated: {formatLogDate(e.date)}
              </p>
              <p className="fw-semibold mb-2">Details</p>
              <DetailBullets value={e.details ?? e.summary} emptyMessage="No details recorded." />
              <div className="d-flex flex-wrap gap-1 mt-2">
                {e.ticketIds?.map((id) => (
                  <LogRowBadge key={id} text={id} variant="primary" />
                ))}
                {e.adrIds?.map((id) => (
                  <LogRowBadge key={id} text={id} variant="dark" />
                ))}
              </div>
            </>
          )}
        />
      </div>
      <PaginationBar page={page} totalPages={totalPages} totalItems={sorted.length} onPageChange={setPage} />
    </>
  )
}

export default function ProjectLogPage() {
  const [tab, setTab] = useState('tickets')

  return (
    <>
      <PageHeader
        title="Project log"
        subtitle="Sorted by id (newest first) by default. Click Id or Updated in the header to change. Ten per page."
      />
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${tab === 'tickets' ? 'active' : ''}`}
            onClick={() => setTab('tickets')}
          >
            Tickets
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${tab === 'adrs' ? 'active' : ''}`}
            onClick={() => setTab('adrs')}
          >
            ADRs
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${tab === 'activity' ? 'active' : ''}`}
            onClick={() => setTab('activity')}
          >
            Activity
          </button>
        </li>
      </ul>
      {tab === 'tickets' && <TicketsTab />}
      {tab === 'adrs' && <AdrsTab />}
      {tab === 'activity' && <ActivityTab />}
    </>
  )
}
