/**
 * Graph Client Factory
 *
 * Creates graph clients. Currently only supports Neo4j.
 */

import { type Neo4jConfig, Neo4jGraphClient } from './neo4j';
import type { GraphClient } from './types';

export function createGraphClient(config: Neo4jConfig): GraphClient {
  return new Neo4jGraphClient(config);
}
