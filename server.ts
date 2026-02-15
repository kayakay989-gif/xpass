// Server entry point - works with both Bun and Node.js
import { serve } from '@hono/node-server';
import app from './backend/hono';
import dotenv from 'dotenv';
import fs from 'fs';

// Load local environment variables (not committed)
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
}

const port = Number(process.env.PORT || 3000);

console.log(`[Server] Starting backend server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`[Server] ✅ Backend server running (port ${info.port})`);
});

