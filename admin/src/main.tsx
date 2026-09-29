import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CMSProvider } from '@glamirk/shared/context/CMSContext';
import App from './App.tsx';
import './index.css';

// The admin needs only the CMS provider. CustomerAuth/Commerce/Account
// providers are storefront concerns and are deliberately absent here — an
// admin session and a shopper session are separate identities.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CMSProvider>
      <App />
    </CMSProvider>
  </StrictMode>,
);
