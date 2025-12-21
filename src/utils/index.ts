/**
 * Almoner Utilities
 *
 * Shared utility functions used across modules.
 */

/**
 * Generate a UUID v4.
 */
export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Safely parse JSON with a default value.
 */
export function safeJsonParse<T>(json: string | undefined | null, defaultValue: T): T {
  if (!json) {
    return defaultValue;
  }
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Format a date as ISO string (date only).
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calculate days between two dates.
 */
export function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs(date1.getTime() - date2.getTime()) / oneDay);
}

/**
 * Normalize a string for comparison (lowercase, trim, single spaces).
 */
export function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Calculate Jaccard similarity between two sets.
 */
export function jaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) {
    return 0;
  }

  return intersection.size / union.size;
}

/**
 * Retry a function with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        break;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Chunk an array into smaller arrays.
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Deduplicate an array by a key function.
 */
export function dedupeBy<T>(array: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of array) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

/**
 * Validate that a value is not null or undefined.
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * First Principle validator.
 * Use this to check implementation decisions against First Principles.
 */
export const FirstPrincipleChecker = {
  /**
   * Check: Graph is source of truth.
   * Violation: Storing entity data outside FalkorDB.
   */
  checkGraphIsSourceOfTruth(operation: string, details: string): void {
    // This is a documentation/logging helper
    console.debug(`[First Principle Check] Graph is source of truth: ${operation} - ${details}`);
  },

  /**
   * Check: Kala is contribution pattern, not currency.
   * Violation: Kala as transferable or tradeable.
   */
  checkKalaIsNotCurrency(operation: string): void {
    if (operation.toLowerCase().includes('transfer')) {
      throw new Error('VIOLATION: Kala cannot be transferred. Kala is contribution pattern, not currency.');
    }
  },

  /**
   * Check: Capture is ritual.
   * Violation: Passive location tracking without explicit volunteer action.
   */
  checkCaptureIsRitual(isExplicitAction: boolean): void {
    if (!isExplicitAction) {
      throw new Error('VIOLATION: Capture must be an explicit volunteer action. Capture is ritual, not surveillance.');
    }
  },

  /**
   * Check: Offline-first.
   * Violation: Requiring connectivity for contribution capture.
   */
  checkOfflineFirst(requiresConnectivity: boolean, operation: string): void {
    if (requiresConnectivity && operation === 'capture') {
      throw new Error('VIOLATION: Contribution capture must work offline. Lower Puna has crappy connectivity.');
    }
  },
};
