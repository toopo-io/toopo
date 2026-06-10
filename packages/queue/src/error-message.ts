/**
 * Narrow an unknown thrown value to a stored error string for the `last_error`
 * column / dead-letter record. Never throws itself, so error handling can never
 * become the source of a new error.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error) ?? 'Unknown error';
  } catch {
    return String(error);
  }
}
