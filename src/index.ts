import { config } from '@/config/config';
import { app } from '@/server/index';

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export default {
  port: config.server.port,
  fetch: app.fetch
};
