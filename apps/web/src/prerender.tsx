import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppContent, createQueryClient } from './App';
export {
  pages,
  dynamicPages,
  notFound,
  publicPages,
  structuredData,
  ORIGIN_TOKEN,
  socialImage,
} from './seo';

export function renderPage(path: string) {
  const client = createQueryClient();
  try {
    return renderToString(
      <React.StrictMode>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[path]}>
            <AppContent />
          </MemoryRouter>
        </QueryClientProvider>
      </React.StrictMode>,
    );
  } finally {
    client.clear();
  }
}
