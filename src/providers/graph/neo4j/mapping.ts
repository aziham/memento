/**
 * Neo4j Record Mapping
 *
 * Translators that convert Neo4j records to TypeScript interfaces.
 * Centralizes all type coercion and null handling.
 *
 * Note: "record" in function names refers to Neo4j driver's result.records,
 * not our domain type. Our domain type is "Note".
 */

import type { Entity, EntityType, Memory, Note, User } from '../types';

// ============================================================
// NODE TYPE DEFINITION
// ============================================================

/**
 * Shape of a Neo4j node as returned by the driver.
 */
export interface Neo4jNode {
  properties: Record<string, unknown>;
}

// ============================================================
// RECORD TRANSLATORS
// ============================================================

/**
 * Convert a Neo4j node to a User.
 * User is a special Entity with id fixed to 'USER' and type always 'Person'.
 * User is never considered well-known - the user is always relevant context.
 */
export function recordToUser(node: Neo4jNode): User {
  const props = node.properties;
  return {
    id: 'USER',
    name: props['name'] as string,
    type: 'Person', // User is always a Person
    description: (props['description'] as string | null) ?? null,
    embedding: props['embedding'] as number[] | null,
    isWellKnown: false, // User is never well-known
    created_at: props['created_at'] as string,
    updated_at: props['updated_at'] as string
  };
}

/**
 * Convert a Neo4j node to an Entity.
 */
export function recordToEntity(node: Neo4jNode): Entity {
  const props = node.properties;
  return {
    id: props['id'] as string,
    name: props['name'] as string,
    type: props['type'] as EntityType,
    description: (props['description'] as string | null) ?? null,
    embedding: props['embedding'] as number[] | null,
    isWellKnown: (props['isWellKnown'] as boolean | null) ?? false, // Default to false if not set
    created_at: props['created_at'] as string,
    updated_at: props['updated_at'] as string
  };
}

/**
 * Convert a Neo4j node to a Memory.
 */
export function recordToMemory(node: Neo4jNode): Memory {
  const props = node.properties;
  return {
    id: props['id'] as string,
    content: props['content'] as string,
    embedding: props['embedding'] as number[] | null,
    created_at: props['created_at'] as string,
    valid_at: (props['valid_at'] as string | null) ?? null,
    invalid_at: (props['invalid_at'] as string | null) ?? null
  };
}

/**
 * Convert a Neo4j node to a Note.
 */
export function recordToNote(node: Neo4jNode): Note {
  const props = node.properties;
  return {
    id: props['id'] as string,
    content: props['content'] as string,
    timestamp: props['timestamp'] as string
  };
}
