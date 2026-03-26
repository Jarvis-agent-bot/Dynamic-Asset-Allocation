/**
 * Structured logging for intentionally swallowed errors.
 * Replaces empty catch blocks with observable diagnostics.
 */
export function logSwallowed(context: string, error: unknown): void {
  console.warn(
    `[swallowed] ${context}:`,
    error instanceof Error ? error.message : error,
  );
}
