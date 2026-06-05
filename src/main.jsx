import React from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) {
    // Chunk not found after a new deployment (stale index.html) — reload once to get fresh assets
    if (error?.message?.includes('Importing a module') && !sessionStorage.getItem('_chnk_reload')) {
      sessionStorage.setItem('_chnk_reload', '1')
      window.location.reload()
    }
  }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, fontFamily: 'monospace', color: '#c00', background: '#fff1f0', minHeight: '100vh' }}>
        <h2>Error al cargar la app</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{this.state.error.message}</pre>
        <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16 }}>Reintentar</button>
      </div>
    )
    return this.props.children
  }
}

window.onerror = (msg, src, line) => {
  const root = document.getElementById('root')
  if (root && !root.childElementCount) {
    root.innerHTML = `<div style="padding:2rem;color:red;font-family:monospace"><b>Error JS:</b> ${msg} (${src}:${line})</div>`
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
