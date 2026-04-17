import { useDisplayText } from '../hooks/useDisplayText'

/** Renders text, masked when privacy/demo mode is on. */
export default function DisplayText({ children }) {
  const display = useDisplayText(children)
  return <>{display}</>
}
