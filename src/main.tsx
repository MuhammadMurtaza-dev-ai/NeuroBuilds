import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// StrictMode removed: Firebase Firestore SDK v12.x has an internal watch-stream
// race condition that fires an assertion error (ve: -1) when React's double-invoke
// effect pattern rapidly subscribes/unsubscribes onSnapshot listeners. This only
// affects the dev build — StrictMode is a no-op in production anyway.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
