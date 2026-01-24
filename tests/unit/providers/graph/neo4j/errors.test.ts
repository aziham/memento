/**
 * Neo4j Error Classification Tests
 *
 * Tests for error classification and schema error detection.
 */

import { describe, expect, test } from 'bun:test';
import { classifyNeo4jError, isSchemaAlreadyExistsError } from '@/providers/graph/neo4j/errors';

describe('classifyNeo4jError', () => {
  describe('CONNECTION_ERROR classification', () => {
    test('classifies connection errors', () => {
      const error = new Error('Failed to connect to database');
      expect(classifyNeo4jError(error)).toBe('CONNECTION_ERROR');
    });

    test('classifies unavailable errors', () => {
      const error = new Error('Database unavailable');
      expect(classifyNeo4jError(error)).toBe('CONNECTION_ERROR');
    });

    test('is case insensitive', () => {
      const error = new Error('CONNECTION failed');
      expect(classifyNeo4jError(error)).toBe('CONNECTION_ERROR');
    });
  });

  describe('CONSTRAINT_VIOLATION classification', () => {
    test('classifies constraint violations by message', () => {
      const error = new Error('Node already exists with constraint');
      expect(classifyNeo4jError(error)).toBe('CONSTRAINT_VIOLATION');
    });

    test('classifies unique constraint violations', () => {
      const error = new Error('Unique constraint violated');
      expect(classifyNeo4jError(error)).toBe('CONSTRAINT_VIOLATION');
    });

    test('classifies constraint violations by error code', () => {
      const error = Object.assign(new Error('Some error'), {
        code: 'Neo.ClientError.Schema.ConstraintValidationFailed'
      });
      expect(classifyNeo4jError(error)).toBe('CONSTRAINT_VIOLATION');
    });
  });

  describe('TRANSIENT_ERROR classification', () => {
    test('classifies deadlock errors', () => {
      const error = new Error('Deadlock detected');
      expect(classifyNeo4jError(error)).toBe('TRANSIENT_ERROR');
    });

    test('classifies timeout errors', () => {
      const error = new Error('Query timeout exceeded');
      expect(classifyNeo4jError(error)).toBe('TRANSIENT_ERROR');
    });

    test('classifies transient errors by code', () => {
      const error = Object.assign(new Error('Some error'), {
        code: 'Neo.TransientError.Transaction.LockClientStopped'
      });
      expect(classifyNeo4jError(error)).toBe('TRANSIENT_ERROR');
    });
  });

  describe('QUERY_ERROR classification', () => {
    test('returns QUERY_ERROR for unknown errors', () => {
      const error = new Error('Something went wrong');
      expect(classifyNeo4jError(error)).toBe('QUERY_ERROR');
    });

    test('returns QUERY_ERROR for non-Error objects', () => {
      expect(classifyNeo4jError('string error')).toBe('QUERY_ERROR');
      expect(classifyNeo4jError(null)).toBe('QUERY_ERROR');
      expect(classifyNeo4jError(undefined)).toBe('QUERY_ERROR');
      expect(classifyNeo4jError(42)).toBe('QUERY_ERROR');
    });
  });
});

describe('isSchemaAlreadyExistsError', () => {
  test('detects "equivalent" schema errors', () => {
    const error = new Error('An equivalent constraint already exists');
    expect(isSchemaAlreadyExistsError(error)).toBe(true);
  });

  test('detects "already exists" errors', () => {
    const error = new Error('Index already exists');
    expect(isSchemaAlreadyExistsError(error)).toBe(true);
  });

  test('detects constraint already exists errors', () => {
    const error = new Error('ConstraintAlreadyExists: Cannot create constraint');
    expect(isSchemaAlreadyExistsError(error)).toBe(true);
  });

  test('detects index already exists errors', () => {
    const error = new Error('IndexAlreadyExists: Cannot create index');
    expect(isSchemaAlreadyExistsError(error)).toBe(true);
  });

  test('detects relationship index syntax errors (DozerDB vs Neo4j)', () => {
    const error = Object.assign(new Error('Invalid input: Expected FOR () but got FOR ()-['), {
      code: 'Neo.ClientError.Statement.SyntaxError'
    });
    expect(isSchemaAlreadyExistsError(error)).toBe(true);
  });

  test('returns false for other errors', () => {
    const error = new Error('Some other error');
    expect(isSchemaAlreadyExistsError(error)).toBe(false);
  });

  test('returns false for non-Error objects', () => {
    expect(isSchemaAlreadyExistsError('string')).toBe(false);
    expect(isSchemaAlreadyExistsError(null)).toBe(false);
    expect(isSchemaAlreadyExistsError(undefined)).toBe(false);
  });
});
