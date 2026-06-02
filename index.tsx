
import React from 'react';
import './index.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './components/auth/AuthProvider';
import { OrganizationProvider } from './components/auth/OrganizationProvider';
import { DeliveryProvider } from './components/delivery/DeliveryProvider';
import { DocsProvider } from './components/docs/DocsProvider';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <OrganizationProvider>
        <DeliveryProvider>
          <DocsProvider>
            <App />
          </DocsProvider>
        </DeliveryProvider>
      </OrganizationProvider>
    </AuthProvider>
  </React.StrictMode>
);