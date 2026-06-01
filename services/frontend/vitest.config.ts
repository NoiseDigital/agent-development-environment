import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit-test runner for the platform's `src/` modules.
// - Pure libs (lib/*.test.ts) run in the default `node` env — fastest.
// - Component tests (*.test.tsx) opt into `happy-dom` per-file via a
//   `// @vitest-environment happy-dom` pragma at the top of the file,
//   so the DOM bootstrap only pays its cost where it's actually needed.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
