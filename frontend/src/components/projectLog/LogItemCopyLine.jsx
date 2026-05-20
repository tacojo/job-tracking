/** Plain text id + title in expanded body (selectable; row header is a button). */
export default function LogItemCopyLine({ id, title }) {
  return (
    <p className="project-log-copy-line small mb-2">
      <span className="user-select-all">{id} — {title}</span>
    </p>
  )
}
