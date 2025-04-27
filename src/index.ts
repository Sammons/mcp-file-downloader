import express from 'express';
import { McpServerManager } from './server.js';

// Initialize express app
const app = express();
app.use(express.json());

// Get singleton instance
const serverManager = McpServerManager.getInstance();

//=============================================================================
// DEPRECATED HTTP+SSE TRANSPORT (PROTOCOL VERSION 2024-11-05)
//=============================================================================
app.get('/mcp/stream', async (req, res) => {
  await serverManager.handleSseStream(req, res);
});

//=============================================================================
// STREAMABLE HTTP TRANSPORT (PROTOCOL VERSION 2025-03-26)
//=============================================================================
app.all('/mcp/streamable', async (req, res) => {
  await serverManager.handleStreamable(req, res);
});

app.post("/mcp/message", async (req, res) => {
  await serverManager.handleMessage(req, res);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backwards compatible MCP server listening on port ${PORT}`);
  console.log(`
==============================================
SUPPORTED TRANSPORT OPTIONS:

1. Streamable Http (Protocol version: 2025-03-26)
   Endpoint: /mcp/streamable
   Methods: GET, POST, DELETE
   Usage: 
     - Initialize with POST to /mcp/streamable
     - Establish SSE stream with GET to /mcp/streamable
     - Send requests with POST to /mcp/streamable
     - Terminate session with DELETE to /mcp/streamable

2. Http + SSE (Protocol version: 2024-11-05)
   Endpoints: /mcp/stream (GET) and /mcp/message (POST)
   Usage:
     - Establish SSE stream with GET to /mcp/stream
     - Send requests with POST to /mcp/message?sessionId=<id>
==============================================
`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  await serverManager.shutdown();
  process.exit(0);
}); 