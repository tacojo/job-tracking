import { Component } from 'react'

/** Catches React render errors and displays a fallback instead of a blank page. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="alert alert-danger m-3" role="alert">
          <h5 className="alert-heading">Something went wrong</h5>
          <p className="mb-0">{String(this.state.error?.message || this.state.error)}</p>
        </div>
      )
    }
    return this.props.children
  }
}
