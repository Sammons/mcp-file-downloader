import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { z } from 'zod';
import { TempStorage } from './utils/temp-storage.js';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';

export class McpServerManager {
  private static instance: McpServerManager;
  private transports: Record<string, StreamableHTTPServerTransport | SSEServerTransport>;
  private mcpServer: McpServer;

  private constructor() {
    this.transports = {};
    this.mcpServer = this.initializeMcpServer();
  }

  public static getInstance(): McpServerManager {
    if (!McpServerManager.instance) {
      McpServerManager.instance = new McpServerManager();
    }
    return McpServerManager.instance;
  }

  private initializeMcpServer(): McpServer {
    const server = new McpServer(
      {
        name: "signed-url-fetch",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {
            description: [
              "A tool for fetching documents using URLs\n",
              "ALWAYS INCLUDE THE FULL URL IN THE INPUT, DO NOT OMIT SECURITY RELATED QUERY PARAMS"
            ],
            examples: [
              {
                description: "Fetch a document from S3 using a signed URL",
                input: {
                  url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/bucket/path/filename.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=credential&X-Amz-Date=20250427T170405Z&X-Amz-Expires=3600&X-Amz-Security-Token=token&X-Amz-Signature=sig&X-Amz-SignedHeaders=host&x-id=GetObject"
                },
                expected_output: "Returns the location of the file on the computer"
              }
            ]
          }
        },
      }
    );

    this.registerTools(server);
    return server;
  }

  private registerTools(server: McpServer): void {
    server.tool(
      "downloadfile",
      "A tool for fetching S3 documents using signed URLs",
      {
        url: z.string().url()
          .describe("The S3 signed URL to fetch. Must include all required AWS signature parameters")
      },
      async (args, _extra) => {
        console.log('Fetch tool called with args:', {
          url: args.url,
        });
        
        try {
          console.log('Starting fetch request...');
          const fetchResponse = await fetch(args.url);
          console.log('Fetch response received:', {
            status: fetchResponse.status,
            statusText: fetchResponse.statusText,
            headers: Object.fromEntries(fetchResponse.headers.entries())
          });

          if (!fetchResponse.ok) {
            throw new Error(`HTTP error! status: ${fetchResponse.status}`);
          }

          const contentType = fetchResponse.headers.get('Content-Type') || 'application/octet-stream';
          console.log('Content type:', contentType);
          
          if (!contentType.startsWith('text/')) {
            console.log('Processing non-text content...');
            console.log('Starting to read response as array buffer...');
            const buffer = Buffer.from(await fetchResponse.arrayBuffer());
            console.log('Buffer created, size:', buffer.length);
            
            const tempStorage = TempStorage.getInstance();
            console.log('Got temp storage instance');
            
            console.log('Saving to temp file...');
            const { filePath } = await tempStorage.saveToTemp(buffer, contentType);
            console.log('Saved to temp file:', filePath);

            return {
              content: [{
                type: "text" as const,
                text: `File downloaded and saved to: ${filePath}\nContent-Type: ${contentType}`
              }]
            };
          } else {
            console.log('Processing text content...');
            const text = await fetchResponse.text();
            console.log('Text content received, length:', text.length);
            return {
              content: [{
                type: "text" as const,
                text
              }]
            };
          }
        } catch (error: unknown) {
          console.error('Error in fetch tool:', error);
          if (error instanceof Error) {
            throw new Error(`Failed to fetch ${args.url}: ${error.message}`);
          }
          throw new Error(`Failed to fetch ${args.url}: Unknown error`);
        }
      }
    );
  }

  public async handleSseStream(req: Request, res: Response): Promise<void> {
    console.log('Received GET request to /mcp/stream (deprecated SSE transport)', {
      headers: req.headers,
      query: req.query
    });
    
    try {
      if (res.headersSent) {
        console.error('Headers already sent for this response');
        return;
      }

      const transport = new SSEServerTransport('/mcp/message', res);
      console.log(`Created SSE transport with session ID: ${transport.sessionId}`);
      
      this.transports[transport.sessionId] = transport;
      
      transport.onerror = (error) => {
        console.error(`Transport error for session ${transport.sessionId}:`, error);
        delete this.transports[transport.sessionId];
      };
      
      res.on("close", () => {
        console.log(`Client disconnected, cleaning up session ${transport.sessionId}`);
        delete this.transports[transport.sessionId];
      });

      await this.mcpServer.connect(transport);
      
      console.log(`SSE stream established with session ${transport.sessionId}`);
    } catch (error) {
      console.error('Error establishing SSE stream:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  public async handleStreamable(req: Request, res: Response): Promise<void> {
    console.log(`Received ${req.method} request to /mcp/streamable`, {
      headers: req.headers,
      query: req.query,
      body: req.body
    });
    
    try {
      const sessionId = req.headers['mcp-session-id'] as string;
      console.log('Session ID from headers:', sessionId);
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports[sessionId]) {
        console.log('Found existing transport for session:', sessionId);
        const existingTransport = this.transports[sessionId];
        if (existingTransport instanceof StreamableHTTPServerTransport) {
          console.log('Reusing existing StreamableHTTPServerTransport');
          transport = existingTransport;
        } else {
          console.log('Transport exists but is wrong type:', existingTransport.constructor.name);
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: Session exists but uses a different transport protocol',
            },
            id: null,
          });
          return;
        }
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        console.log('Creating new transport for initialization request');
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sessionId) => {
            console.log(`StreamableHTTP session initialized with ID: ${sessionId}`);
            this.transports[sessionId] = transport;
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports[sid]) {
            console.log(`Transport closed for session ${sid}, removing from transports map`);
            delete this.transports[sid];
          }
        };

        console.log('Connecting new transport to server...');
        await this.mcpServer.connect(transport);
        console.log('Transport connected to server');
      } else {
        console.log('Invalid request - missing session ID or not initialization:', {
          hasSessionId: !!sessionId,
          method: req.method,
          isInitRequest: isInitializeRequest(req.body)
        });
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      console.log('Handling request with transport...');
      await transport.handleRequest(req, res, req.body);
      console.log('Request handled successfully');
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  public async handleMessage(req: Request, res: Response): Promise<void> {
    const sessionId = req.query.sessionId as string;
    console.log('Received message for session:', sessionId);
    console.log('Message body:', JSON.stringify(req.body, null, 2));

    if (!sessionId) {
      console.error('No session ID provided');
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No session ID provided',
        },
        id: null,
      });
      return;
    }

    const transport = this.transports[sessionId];
    if (!transport || !(transport instanceof SSEServerTransport)) {
      console.error('Invalid transport type or no transport found for session:', sessionId);
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Invalid session or transport type',
        },
        id: null,
      });
      return;
    }

    try {
      console.log('Handling message with transport');
      await transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('Error handling message:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal server error',
          },
          id: req.body?.id || null,
        });
      }
    }
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down server manager...');
    for (const sessionId in this.transports) {
      try {
        console.log(`Closing transport for session ${sessionId}`);
        await this.transports[sessionId].close();
        delete this.transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport for session ${sessionId}:`, error);
      }
    }
    console.log('Server manager shutdown complete');
  }
} 