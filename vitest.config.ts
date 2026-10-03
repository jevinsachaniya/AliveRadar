import { defineConfig } from 'vitest/config';
const env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unused:unused@localhost:54329/unused',
  DEV_MOCK_ORIGIN: 'http://127.0.0.1:4006',
};
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'web',
          include: ['tests/web/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/web/setup.ts'],
          env,
        },
      },
    ],
  },
});
