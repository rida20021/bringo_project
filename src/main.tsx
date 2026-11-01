import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Toaster } from 'sonner';
import App from './App';
import './styles/global.css';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || 'http://localhost:3210');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </ConvexAuthProvider>
  </React.StrictMode>
);
