/**
 * Neo4j GDS (Graph Data Science) Operations
 *
 * Operations for running graph algorithms like Personalized PageRank.
 * Uses the GDS library for efficient in-memory graph processing.
 */

import neo4j, { type Driver, type Integer } from 'neo4j-driver';
import type { PPRResult } from '../../types';
import { runCommand } from '../errors';
import { recordToMemory } from '../mapping';
import { GDS_DROP_GRAPH, GDS_GRAPH_EXISTS, GDS_PROJECT_GRAPH, GDS_RUN_PPR } from '../queries';

/**
 * Run Personalized PageRank on the knowledge graph.
 *
 * 1. Projects an in-memory graph with Memory, Entity, User nodes and ABOUT edges
 * 2. Runs PPR with weighted source nodes (anchor entities)
 * 3. Returns Memory nodes with their PPR scores
 * 4. Cleans up the graph projection
 *
 * @param driver - Neo4j driver
 * @param database - Database name
 * @param sourceNodeIds - Entity IDs to use as PPR source nodes
 * @param damping - Damping factor (0.75 recommended for knowledge graphs)
 * @param iterations - Max iterations for convergence
 * @param limit - Max results to return
 * @returns Memories with PPR scores, sorted by score descending
 */
export async function runPersonalizedPageRank(
  driver: Driver,
  database: string,
  sourceNodeIds: string[],
  damping: number,
  iterations: number,
  limit: number
): Promise<PPRResult[]> {
  if (sourceNodeIds.length === 0) return [];

  // Generate unique graph name to avoid conflicts
  const graphName = `retrieval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Step 1: Project the graph
    await projectGraph(driver, database, graphName);

    // Step 2: Get node references for source nodes
    const sourceNodes = await getNodeReferences(driver, database, sourceNodeIds);
    if (sourceNodes.length === 0) {
      return [];
    }

    // Step 3: Run PPR
    const results = await runPPR(
      driver,
      database,
      graphName,
      sourceNodes,
      damping,
      iterations,
      limit
    );

    return results;
  } finally {
    // Step 4: Always clean up the graph projection
    await dropGraph(driver, database, graphName);
  }
}

/**
 * Project the graph for PPR.
 */
async function projectGraph(driver: Driver, database: string, graphName: string): Promise<void> {
  await runCommand(
    driver,
    database,
    'read',
    async (session) => {
      await session.run(GDS_PROJECT_GRAPH, { graphName });
    },
    'projectGraph'
  );
}

/**
 * Get Neo4j node references for entity IDs.
 * GDS requires actual node references, not just IDs.
 */
async function getNodeReferences(
  driver: Driver,
  database: string,
  entityIds: string[]
): Promise<Integer[]> {
  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(
        `
        UNWIND $entityIds AS entityId
        MATCH (e:Entity {id: entityId})
        RETURN id(e) AS nodeId
        `,
        { entityIds }
      );
      return result.records.map((r) => r.get('nodeId') as Integer);
    },
    'getNodeReferences'
  );
}

/**
 * Run PPR on the projected graph.
 */
async function runPPR(
  driver: Driver,
  database: string,
  graphName: string,
  sourceNodes: Integer[],
  damping: number,
  iterations: number,
  limit: number
): Promise<PPRResult[]> {
  return runCommand(
    driver,
    database,
    'read',
    async (session) => {
      const result = await session.run(GDS_RUN_PPR, {
        graphName,
        sourceNodes,
        damping,
        iterations: neo4j.int(iterations),
        limit: neo4j.int(limit)
      });

      return result.records.map((r) => ({
        memory: recordToMemory(r.get('node')),
        score: r.get('score') as number
      }));
    },
    'runPPR'
  );
}

/**
 * Drop the graph projection.
 */
async function dropGraph(driver: Driver, database: string, graphName: string): Promise<void> {
  try {
    // Check if graph exists first
    const exists = await runCommand(
      driver,
      database,
      'read',
      async (session) => {
        const result = await session.run(GDS_GRAPH_EXISTS, { graphName });
        return result.records[0]?.get('exists') as boolean;
      },
      'checkGraphExists'
    );

    if (exists) {
      await runCommand(
        driver,
        database,
        'read',
        async (session) => {
          await session.run(GDS_DROP_GRAPH, { graphName });
        },
        'dropGraph'
      );
    }
  } catch {
    // Ignore errors during cleanup - graph may not exist
  }
}
