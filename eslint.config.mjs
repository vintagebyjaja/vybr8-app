import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "src/lib/supabase/database.types.ts"],
  },
  {
    // Domain logic stays framework-free and testable without installs.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["next", "next/*", "react", "react-dom", "@supabase/*", "@/server/*", "@/lib/*", "@/integrations/*"] },
      ],
    },
  },
  {
    // The secret key and server helpers must never reach client components.
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/server/*"] }],
    },
  },
];

export default config;
