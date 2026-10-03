import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppContent, createQueryClient } from './App';
import './styles.css';
import './website.css';

const container = document.getElementById('root')!;
const application = (
  <React.StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
if (container.dataset.prerender === 'true') hydrateRoot(container, application);
else createRoot(container).render(application);
