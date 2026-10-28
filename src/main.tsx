import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { AuthProvider } from '@convex-dev/auth/react';
import App from './App';
import './styles/global.css';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL || 'http://localhost:3210');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ConvexProvider>
  </React.StrictMode>
);