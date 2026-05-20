function SortTh({ children, active, dir, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`project-log-sort-th ${active ? 'project-log-sort-th--active' : ''} ${className}`.trim()}
      onClick={onClick}
      aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      <span>{children}</span>
      {active ? (
        <span className="project-log-sort-th__icon" aria-hidden>
          {dir === 'desc' ? ' ↓' : ' ↑'}
        </span>
      ) : null}
    </button>
  )
}

/** Column titles; Id and Updated are clickable sort controls. */
export default function LogListHeadings({ sort, onSortId, onSortUpdated }) {
  return (
    <div className="project-log-row project-log-row--headings px-3 py-2 border-bottom">
      <div className="project-log-row__heading-static">Status</div>
      <SortTh active={sort.field === 'id'} dir={sort.dir} onClick={onSortId}>
        Id
      </SortTh>
      <div className="project-log-row__heading-static">Title</div>
      <div className="project-log-row__heading-static text-end">Labels</div>
      <div className="project-log-row__heading-static text-end">
        <SortTh active={sort.field === 'updated'} dir={sort.dir} onClick={onSortUpdated}>
          Updated
        </SortTh>
      </div>
    </div>
  )
}
