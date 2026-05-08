/** Shared stderr diagnostics for CLI-style tools (minimal v0). */
export function logWarning(message: string): void {
  console.error(message);
}
