import { defineConfig } from 'vitest/config';

// Unit-test runner for the pure `lib/` modules — the platform's
// regression net for aggregation logic, permission predicates, format
// helpers, and the Vega-Lite guard. Frontend components are intentionally
// out of scope here; the high-value catches are in the deterministic libs.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
