/**
 * Memento Server Entry Point
 *
 * Starts the Memento server with a professional startup display.
 */

import { config } from '@/config/config';
import { getClients } from '@/server/clients';
import { app } from '@/server/index';
import { displayBanner } from '@/utils/banner';

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Display banner immediately
displayBanner();

// Initialize clients eagerly (this will display the startup info)
// Use top-level await (supported in Bun)
await getClients();

export default {
  port: config.server.port,
  fetch: app.fetch
};
