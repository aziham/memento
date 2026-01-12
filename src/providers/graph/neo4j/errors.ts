/**
 * Neo4j Error Handling & Session Management
 *
 * Provides error classification, retry logic, and the runCommand
 * orchestrator that eliminates session boilerplate from operations.
 */

import type { Driver, Session } from 'neo4j-driver';
import type { GraphErrorType } from '../types';
import { GraphClientError } from '../types';
import { RETRY } from './constants';

// ============================================================
// ERROR CLASSIFICATION
// ============================================================

/**
 * Map Neo4j-specific errors to standard GraphErrorType.
 *
 * Categories:
 * - CONNECTION_ERROR: Network/availability issues
 * - CONSTRAINT_VIOLATION: Unique constraint failures (not retryable)
 * - TRANSIENT_ERROR: Deadlocks, timeouts (retryable)
 * - QUERY_ERROR: Syntax or logic errors
 */
export function classifyNeo4jError(error: unknown): GraphErrorType {
  if (!(error instanceof Error)) return 'QUERY_ERROR';

  const message = error.message.toLowerCase();
  const code = (error as { code?: string }).code?.toLowerCase() ?? '';

  // Connection errors
  if (
    message.includes('connection') ||
    message.includes('unavailable') ||
    message.includes('failed to connect')
  ) {
    return 'CONNECTION_ERROR';
  }

  // Constraint violations - not retryable
  if (message.includes('constraint') || message.includes('unique') || code.includes('constraint')) {
    return 'CONSTRAINT_VIOLATION';
  }

  // Transient errors - retryable
  if (
    message.includes('deadlock') ||
    message.includes('timeout') ||
    message.includes('transient') ||
    code.includes('transient') ||
    code.includes('deadlock')
  ) {
    return 'TRANSIENT_ERROR';
  }

  return 'QUERY_ERROR';
}

/**
 * Check if an error indicates a schema element already exists.
 * Also handles syntax errors for unsupported schema features (e.g., relationship indexes
 * in standard Neo4j vs DozerDB Enterprise).
 */
export function isSchemaAlreadyExistsError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const code = (error as { code?: string }).code?.toLowerCase() ?? '';
    return (
      message.includes('equivalent') ||
      message.includes('already exists') ||
      message.includes('constraintalreadyexists') ||
      message.includes('indexalreadyexists') ||
      // Handle unsupported relationship index syntax (standard Neo4j vs DozerDB)
      (code.includes('syntaxerror') && message.includes('for ()-['))
    );
  }
  return false;
}

// ============================================================
// RETRY LOGIC
// ============================================================

/**
 * Execute an operation with exponential backoff retry for transient errors.
 *
 * Retry behavior:
 * - CONSTRAINT_VIOLATION: Fail immediately (not recoverable)
 * - TRANSIENT_ERROR: Retry with exponential backoff
 * - Other errors: Fail after first attempt
 */
export async function withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < RETRY.MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const errorType = classifyNeo4jError(error);

      // Don't retry constraint violations
      if (errorType === 'CONSTRAINT_VIOLATION') {
        throw new GraphClientError(
          `Constraint violation in ${operationName}: ${error instanceof Error ? error.message : String(error)}`,
          'CONSTRAINT_VIOLATION',
          error instanceof Error ? error : undefined
        );
      }

      // Retry transient errors with exponential backoff
      if (errorType === 'TRANSIENT_ERROR' && attempt < RETRY.MAX_ATTEMPTS - 1) {
        const delay = RETRY.BASE_DELAY_MS * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }

      // Unknown errors or max retries reached
      lastError = error instanceof Error ? error : new Error(String(error));
      break;
    }
  }

  throw new GraphClientError(
    `Operation ${operationName} failed after ${RETRY.MAX_ATTEMPTS} attempts: ${lastError?.message}`,
    'TRANSIENT_ERROR',
    lastError
  );
}

// ============================================================
// SESSION LIFECYCLE MANAGEMENT
// ============================================================

export type CommandMode = 'read' | 'write';

/**
 * Unified session lifecycle orchestrator.
 *
 * Eliminates repetitive try/finally session.close() boilerplate
 * from every operation. Handles:
 * - Session creation with correct database
 * - Automatic cleanup on success or failure
 * - Consistent error context
 *
 * @param driver - Neo4j driver instance
 * @param database - Target database name
 * @param mode - 'read' or 'write' (for future transaction mode optimization)
 * @param operation - The actual work to perform with the session
 * @param operationName - Human-readable name for error messages
 */
export async function runCommand<T>(
  driver: Driver,
  database: string,
  _mode: CommandMode,
  operation: (session: Session) => Promise<T>,
  operationName: string
): Promise<T> {
  const session = driver.session({ database });
  try {
    return await operation(session);
  } catch (error) {
    const errorType = classifyNeo4jError(error);
    throw new GraphClientError(
      `${operationName} failed: ${error instanceof Error ? error.message : String(error)}`,
      errorType,
      error instanceof Error ? error : undefined
    );
  } finally {
    await session.close();
  }
}

/**
 * Run a command with automatic retry for transient errors.
 * Combines runCommand lifecycle management with withRetry resilience.
 */
export async function runCommandWithRetry<T>(
  driver: Driver,
  database: string,
  mode: CommandMode,
  operation: (session: Session) => Promise<T>,
  operationName: string
): Promise<T> {
  return withRetry(
    () => runCommand(driver, database, mode, operation, operationName),
    operationName
  );
}
