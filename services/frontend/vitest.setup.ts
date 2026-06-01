// Global test setup. Adds @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, etc.) to vitest's `expect`.
// Pure-lib tests pay no cost here — the import is tree-shake-friendly
// and the matchers register cheaply at module load.
import '@testing-library/jest-dom/vitest';
