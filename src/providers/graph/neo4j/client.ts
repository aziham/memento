/**
 * Neo4j Graph Client
 *
 * Thin orchestrator that implements the GraphClient interface
 * by delegating to specialized operation modules.
 */

import neo4j, { type Driver } from 'neo4j-driver';
import type {
  CreateEntityInput,
  CreateMemoryInput,
  CreateNoteInput,
  CreateUserInput,
  Entity,
  EntityData,
  EntityUpdate,
  EntityWithDegree,
  GraphClient,
  InvalidatedMemoryData,
  Memory,
  MemoryUpdate,
  Note,
  PPRResult,
  ProvenanceData,
  SearchResult,
  TransactionClient,
  User
} from '../types';
import { GraphClientError } from '../types';
import { classifyNeo4jError, withRetry } from './errors';
import {
  createAboutEdge,
  createAboutUserEdge,
  createEntities,
  createExtractedFromEdge,
  createInvalidatesEdge,
  createMemories,
  createMentionsEdge,
  createNotes,
  createTransactionClient,
  createUser,
  deleteNodes,
  getEntitiesByName,
  getEntitiesWithDegree,
  getEntityById,
  getEntityByName,
  getMemoryAboutEntities,
  getMemoryById,
  getMemoryInvalidates,
  getMemoryProvenance,
  getNeighborhood,
  getNoteById,
  getOrCreateUser,
  getUser,
  runPersonalizedPageRank,
  searchFulltext,
  searchHybrid,
  searchVector,
  updateEntity,
  updateMemory,
  updateUser
} from './operations';
import { initializeSchema } from './schema';

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Configuration for Neo4j connection.
 */
export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database: string;
}

// ============================================================
// CLIENT IMPLEMENTATION
// ============================================================

/**
 * Neo4j implementation of the GraphClient interface.
 *
 * This is a thin orchestrator - all business logic lives in the
 * operation modules (nodes, edges, search). The client's job is to:
 * 1. Manage the driver lifecycle (connect/disconnect)
 * 2. Delegate operations to the appropriate module
 * 3. Provide the driver and database to each operation
 */
export class Neo4jGraphClient implements GraphClient {
  private _driver: Driver | null = null;
  private readonly config: Neo4jConfig;

  constructor(config: Neo4jConfig) {
    this.config = config;
  }

  /**
   * Get the Neo4j driver instance.
   * Throws if not connected.
   */
  get driver(): Driver {
    if (!this._driver) {
      throw new GraphClientError('Not connected to Neo4j', 'CONNECTION_ERROR');
    }
    return this._driver;
  }

  /**
   * Get the database name.
   */
  get database(): string {
    return this.config.database;
  }

  // ============================================================
  // CONNECTION MANAGEMENT
  // ============================================================

  async connect(): Promise<void> {
    this._driver = neo4j.driver(
      this.config.uri,
      neo4j.auth.basic(this.config.user, this.config.password)
    );

    // Fail-fast: verify connectivity at startup
    try {
      await this.driver.verifyConnectivity();
    } catch (error) {
      throw new GraphClientError(
        `Failed to connect to Neo4j at ${this.config.uri}: ${error instanceof Error ? error.message : String(error)}`,
        'CONNECTION_ERROR',
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this._driver) {
      await this._driver.close();
      this._driver = null;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this._driver) {
      return false;
    }
    try {
      await this._driver.verifyConnectivity();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // SCHEMA MANAGEMENT
  // ============================================================

  async initializeSchema(dimensions: number): Promise<void> {
    // Use withRetry for transient error handling during schema initialization
    await withRetry(async () => {
      const session = this.driver.session({ database: this.config.database });
      try {
        await initializeSchema(session, dimensions);
      } finally {
        await session.close();
      }
    }, 'initializeSchema');
  }

  // ============================================================
  // NODE OPERATIONS
  // ============================================================

  // --- User Operations (singleton) ---

  async getUser(): Promise<User | null> {
    return getUser(this.driver, this.config.database);
  }

  async createUser(user: CreateUserInput): Promise<User> {
    return createUser(this.driver, this.config.database, user);
  }

  async updateUser(
    updates: Partial<Pick<User, 'name' | 'description' | 'embedding'>>
  ): Promise<User> {
    return updateUser(this.driver, this.config.database, updates);
  }

  async getOrCreateUser(defaults: CreateUserInput): Promise<User> {
    return getOrCreateUser(this.driver, this.config.database, defaults);
  }

  // --- Entity, Memory, Note Operations ---

  async createEntities(entities: CreateEntityInput[]): Promise<Entity[]> {
    return createEntities(this.driver, this.config.database, entities);
  }

  async createMemories(memories: CreateMemoryInput[]): Promise<Memory[]> {
    return createMemories(this.driver, this.config.database, memories);
  }

  async createNotes(notes: CreateNoteInput[]): Promise<Note[]> {
    return createNotes(this.driver, this.config.database, notes);
  }

  async getEntityById(id: string): Promise<Entity | null> {
    return getEntityById(this.driver, this.config.database, id);
  }

  async getEntityByName(name: string): Promise<Entity | null> {
    return getEntityByName(this.driver, this.config.database, name);
  }

  async getEntitiesWithDegree(names: string[]): Promise<EntityWithDegree[]> {
    return getEntitiesWithDegree(this.driver, this.config.database, names);
  }

  async getMemoryById(id: string): Promise<Memory | null> {
    return getMemoryById(this.driver, this.config.database, id);
  }

  async getNoteById(id: string): Promise<Note | null> {
    return getNoteById(this.driver, this.config.database, id);
  }

  async updateMemory(id: string, updates: MemoryUpdate): Promise<Memory> {
    return updateMemory(this.driver, this.config.database, id, updates);
  }

  async updateEntity(id: string, updates: EntityUpdate): Promise<Entity> {
    return updateEntity(this.driver, this.config.database, id, updates);
  }

  async deleteNodes(ids: string[]): Promise<void> {
    return deleteNodes(this.driver, this.config.database, ids);
  }

  // ============================================================
  // STRUCTURAL EDGE OPERATIONS
  // ============================================================

  async createMentionsEdge(noteId: string, entityId: string): Promise<string> {
    return createMentionsEdge(this.driver, this.config.database, noteId, entityId);
  }

  async createExtractedFromEdge(memoryId: string, noteId: string): Promise<string> {
    return createExtractedFromEdge(this.driver, this.config.database, memoryId, noteId);
  }

  async createInvalidatesEdge(
    newMemoryId: string,
    oldMemoryId: string,
    reason: string
  ): Promise<string> {
    return createInvalidatesEdge(
      this.driver,
      this.config.database,
      newMemoryId,
      oldMemoryId,
      reason
    );
  }

  async createAboutEdge(memoryId: string, entityId: string): Promise<string> {
    return createAboutEdge(this.driver, this.config.database, memoryId, entityId);
  }

  async createAboutUserEdge(memoryId: string): Promise<string> {
    return createAboutUserEdge(this.driver, this.config.database, memoryId);
  }

  // ============================================================
  // SEARCH OPERATIONS
  // ============================================================

  async searchVector(
    label: 'Memory' | 'Entity',
    vector: number[],
    limit: number,
    options?: { validOnly?: boolean }
  ): Promise<SearchResult<Memory | Entity>[]> {
    return searchVector(this.driver, this.config.database, label, vector, limit, options);
  }

  async searchFulltext(
    label: 'Memory' | 'Entity',
    query: string,
    limit: number,
    options?: { validOnly?: boolean }
  ): Promise<SearchResult<Memory | Entity>[]> {
    return searchFulltext(this.driver, this.config.database, label, query, limit, options);
  }

  async searchHybrid(
    label: 'Memory' | 'Entity',
    query: string,
    vector: number[],
    limit: number,
    options?: { validOnly?: boolean }
  ): Promise<SearchResult<Memory | Entity>[]> {
    return searchHybrid(this.driver, this.config.database, label, query, vector, limit, options);
  }

  async getNeighborhood(anchorIds: string[]): Promise<Memory[]> {
    return getNeighborhood(this.driver, this.config.database, anchorIds);
  }

  async getMemoryAboutEntities(memoryIds: string[]): Promise<Map<string, string[]>> {
    return getMemoryAboutEntities(this.driver, this.config.database, memoryIds);
  }

  async runPersonalizedPageRank(
    sourceNodeIds: string[],
    damping: number,
    iterations: number,
    limit: number
  ): Promise<PPRResult[]> {
    return runPersonalizedPageRank(
      this.driver,
      this.config.database,
      sourceNodeIds,
      damping,
      iterations,
      limit
    );
  }

  async getMemoryInvalidates(memoryIds: string[]): Promise<Map<string, InvalidatedMemoryData[]>> {
    return getMemoryInvalidates(this.driver, this.config.database, memoryIds);
  }

  async getMemoryProvenance(memoryIds: string[]): Promise<Map<string, ProvenanceData>> {
    return getMemoryProvenance(this.driver, this.config.database, memoryIds);
  }

  async getEntitiesByName(names: string[]): Promise<Map<string, EntityData>> {
    return getEntitiesByName(this.driver, this.config.database, names);
  }

  // ============================================================
  // TRANSACTION SUPPORT
  // ============================================================

  async executeTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const driver = this.driver;
    const session = driver.session({ database: this.config.database });

    try {
      return await session.executeWrite(async (managedTx) => {
        const txClient = createTransactionClient(managedTx);
        return fn(txClient);
      });
    } catch (error) {
      const errorType = classifyNeo4jError(error);
      throw new GraphClientError(
        `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
        errorType,
        error instanceof Error ? error : undefined
      );
    } finally {
      await session.close();
    }
  }
}
