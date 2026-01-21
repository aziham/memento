/**
 * Server Module
 *
 * Creates and configures the Hono application.
 * Composition root that wires together all endpoints.
 */

import { Hono } from 'hono';
import { handleMcp } from './mcp';
import { mountProxyRoutes } from './proxy';

const app = new Hono();

// Mount proxy routes (LLM passthrough with memory injection)
mountProxyRoutes(app);

// Mount MCP endpoint (note storage via Model Context Protocol)
app.all('/mcp', handleMcp);

export { app };
