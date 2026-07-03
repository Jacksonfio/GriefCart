import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { Auth } from './services/griefcart-client';

try {
  Auth.handleRedirect();

  const rootEl = document.getElementById('root');
  if (!rootEl) {
    document.body.innerHTML = '<div style="color:red;padding:40px;font-family:sans-serif">Error: #root element not found</div>';
  } else {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  }
} catch (e) {
  document.body.innerHTML = `<div style="color:red;padding:40px;font-family:sans-serif">
    <h2>Application Error</h2>
    <pre>${e instanceof Error ? e.message : String(e)}</pre>
    <pre style="font-size:11px;margin-top:8px">${e instanceof Error ? e.stack : ''}</pre>
  </div>`;
}
