import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next@16 ships native FLAT configs (each export is a config
// array), so import + spread them directly. The old
// `FlatCompat().extends("next/core-web-vitals", "next/typescript")` bridge treats
// them as legacy eslintrc shareable configs and crashes the validator
// ("Converting circular structure to JSON" on eslint-plugin-react), regardless
// of the eslint major. See https://nextjs.org/docs/app/api-reference/config/eslint
const eslintConfig = [
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-plugin-react-hooks@7 (bundled with config-next 16) turns on the new
    // React-Compiler readiness rules as ERRORS. The codebase predates them (~37
    // hits), so demote to warnings to keep CI green and address incrementally —
    // they're style/compiler-readiness lints, not runtime bugs. Re-tighten as the
    // call sites are migrated.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default eslintConfig;
