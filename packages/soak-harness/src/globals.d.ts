/**
 * Minimal ambient globals so the harness typechecks without pulling @types/node
 * into the workspace (the repo deliberately avoids it — see packages/inference).
 * These declare only the surface this package touches; at runtime it executes
 * under Node/tsx where the real implementations exist.
 */
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare const performance: { now(): number };

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};
