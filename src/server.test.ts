import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServerManager } from './server.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { TempStorage } from './utils/temp-storage.js';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';

// Mock dependencies
const mockConnect = vi.fn();
const mockTool = vi.fn();
const mockHandleRequest = vi.fn();
const mockHandlePostMessage = vi.fn();
const mockClose = vi.fn();

// Mock instanceof check
const originalInstanceOf = Object.prototype[Symbol.hasInstance];
Object.defineProperty(SSEServerTransport, Symbol.hasInstance, {
  value: (instance: any) => {
    return instance?.sessionId === 'mock-sse-session-id';
  }
});

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  isInitializeRequest: vi.fn().mockImplementation((body) => 
    body?.jsonrpc === '2.0' && body?.method === 'initialize'
  )
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const McpServer = vi.fn().mockImplementation((config, capabilities) => ({
    connect: mockConnect,
    tool: mockTool,
    config,
    capabilities
  }));
  return { McpServer };
});

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => {
  const StreamableHTTPServerTransport = vi.fn().mockImplementation((options) => {
    const transport = {
      sessionId: 'mock-streamable-session-id',
      handleRequest: mockHandleRequest,
      close: mockClose,
      onclose: vi.fn()
    };
    if (options?.onsessioninitialized) {
      setTimeout(() => options.onsessioninitialized('mock-streamable-session-id'), 0);
    }
    return transport;
  });
  return { StreamableHTTPServerTransport };
});

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => {
  const SSEServerTransport = vi.fn().mockImplementation(() => {
    return {
      sessionId: 'mock-sse-session-id',
      handlePostMessage: mockHandlePostMessage,
      close: mockClose,
      onerror: vi.fn()
    };
  });
  return { SSEServerTransport };
});

vi.mock('./utils/temp-storage.js', () => ({
  TempStorage: {
    getInstance: vi.fn().mockReturnValue({
      saveToTemp: vi.fn().mockResolvedValue({ filePath: '/tmp/mock-file' })
    })
  }
}));

// Create mock Response factory
const createMockResponse = (options: { 
  body?: string | null,
  status?: number,
  statusText?: string,
  headers?: Record<string, string>,
  ok?: boolean
} = {}) => {
  const mockResponse = {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    headers: new Headers(options.headers ?? {}),
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    text: vi.fn().mockResolvedValue(options.body ?? 'mock text content'),
    json: vi.fn().mockResolvedValue({}),
    blob: vi.fn().mockResolvedValue(new Blob()),
    formData: vi.fn().mockResolvedValue(new FormData()),
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    redirected: false,
    type: 'default' as ResponseType,
    url: 'https://example.com',
    buffer: () => Promise.resolve(Buffer.from([])),
    write: vi.fn(),
    end: vi.fn()
  };

  return mockResponse as unknown as globalThis.Response;
};

// Mock fetch globally
const mockFetchResponse = createMockResponse({
  headers: {
    'Content-Type': 'application/pdf'
  }
});

global.fetch = vi.fn().mockResolvedValue(mockFetchResponse);

// Mock RequestHandlerExtra
const mockExtra = {
  signal: new AbortController().signal,
  sendNotification: vi.fn(),
  sendRequest: vi.fn()
};

describe('McpServerManager', () => {
  let serverManager: McpServerManager;
  let mockRequest: Partial<ExpressRequest>;
  let mockResponse: Partial<ExpressResponse>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup tool callback
    mockTool.mockImplementation((name, description, schema, callback) => {
      if (name === 'downloadfile') {
        return callback;
      }
    });

    // Get singleton instance
    serverManager = McpServerManager.getInstance();

    // Setup mock request and response
    mockRequest = {
      headers: {},
      query: {},
      body: {},
      method: 'GET'
    };

    mockResponse = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn()
    };

    // Create a mock McpServer instance with required config
    const mockServer = new McpServer(
      {
        name: "signed-url-fetch",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {
            description: ["Test description"],
            examples: []
          }
        }
      }
    );
    // @ts-ignore - accessing private method for testing
    serverManager.registerTools(mockServer);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = McpServerManager.getInstance();
      const instance2 = McpServerManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('handleSseStream', () => {
    it('should handle SSE stream setup successfully', async () => {
      await serverManager.handleSseStream(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(SSEServerTransport).toHaveBeenCalledWith('/mcp/message', mockResponse);
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should handle errors during SSE stream setup', async () => {
      const error = new Error('Connection failed');
      mockConnect.mockRejectedValueOnce(error);

      await serverManager.handleSseStream(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Connection failed',
        },
        id: null,
      });
    });
  });

  describe('handleStreamable', () => {
    it('should handle new streamable connection', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = { jsonrpc: '2.0', method: 'initialize', id: 1 };

      const promise = serverManager.handleStreamable(mockRequest as ExpressRequest, mockResponse as ExpressResponse);
      
      // Wait for the next tick to allow the onsessioninitialized callback to execute
      await new Promise(resolve => setTimeout(resolve, 0));
      await promise;

      expect(StreamableHTTPServerTransport).toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalled();
    });

    it('should handle existing streamable connection', async () => {
      // First create a connection with initialization
      mockRequest.method = 'POST';
      mockRequest.body = { jsonrpc: '2.0', method: 'initialize', id: 1 };
      
      const promise = serverManager.handleStreamable(mockRequest as ExpressRequest, mockResponse as ExpressResponse);
      
      // Wait for the next tick to allow the onsessioninitialized callback to execute
      await new Promise(resolve => setTimeout(resolve, 0));
      await promise;

      // Then try to use the same connection
      mockRequest.headers = { 'mcp-session-id': 'mock-streamable-session-id' };
      mockRequest.body = { jsonrpc: '2.0', method: 'test', id: 2 };
      await serverManager.handleStreamable(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockHandleRequest).toHaveBeenCalled();
    });

    it('should handle invalid session ID', async () => {
      mockRequest.headers = { 'mcp-session-id': 'invalid-session' };

      await serverManager.handleStreamable(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
    });
  });

  describe('handleMessage', () => {
    it('should handle message for valid SSE session', async () => {
      // First create an SSE connection
      mockResponse.write = vi.fn();
      mockResponse.end = vi.fn();
      await serverManager.handleSseStream(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      // Then try to handle a message
      mockRequest.query = { sessionId: 'mock-sse-session-id' };
      mockRequest.body = { jsonrpc: '2.0', method: 'test', id: 1 };
      await serverManager.handleMessage(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockHandlePostMessage).toHaveBeenCalled();
    });

    it('should handle missing session ID', async () => {
      mockRequest.query = {};
      
      await serverManager.handleMessage(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No session ID provided',
        },
        id: null,
      });
    });

    it('should handle invalid session ID', async () => {
      mockRequest.query = { sessionId: 'invalid-session' };
      
      await serverManager.handleMessage(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Invalid session or transport type',
        },
        id: null,
      });
    });
  });

  describe('shutdown', () => {
    it('should close all active transports', async () => {
      // Create both types of transports
      await serverManager.handleSseStream(mockRequest as ExpressRequest, mockResponse as ExpressResponse);
      
      mockRequest.method = 'POST';
      mockRequest.body = { jsonrpc: '2.0', method: 'initialize' };
      await serverManager.handleStreamable(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      // Shutdown
      await serverManager.shutdown();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle errors during transport closure', async () => {
      const error = new Error('Close failed');
      mockClose.mockRejectedValueOnce(error);

      // Create a transport
      await serverManager.handleSseStream(mockRequest as ExpressRequest, mockResponse as ExpressResponse);

      // Shutdown should not throw
      await expect(serverManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('downloadfile tool', () => {
    let toolCallback: any;

    beforeEach(() => {
      // Create a mock McpServer instance with required config
      const mockServer = new McpServer(
        {
          name: "signed-url-fetch",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {
              description: ["Test description"],
              examples: []
            }
          }
        }
      );
      // @ts-ignore - accessing private method for testing
      serverManager.registerTools(mockServer);
      toolCallback = mockTool.mock.calls[mockTool.mock.calls.length - 1][3];
    });

    it('should handle non-text content', async () => {
      const result = await toolCallback({ url: 'https://example.com/file.pdf' }, mockExtra);
      
      expect(fetch).toHaveBeenCalledWith('https://example.com/file.pdf');
      expect(TempStorage.getInstance().saveToTemp).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: expect.stringContaining('/tmp/mock-file')
        }]
      });
    });

    it('should handle text content', async () => {
      const textResponse = createMockResponse({
        body: 'mock text content',
        headers: {
          'Content-Type': 'text/plain'
        }
      });
      
      vi.mocked(global.fetch).mockResolvedValueOnce(textResponse);
      
      const result = await toolCallback({ url: 'https://example.com/file.txt' }, mockExtra);
      
      expect(fetch).toHaveBeenCalledWith('https://example.com/file.txt');
      expect(textResponse.text).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{
          type: 'text',
          text: 'mock text content'
        }]
      });
    });

    it('should handle fetch errors', async () => {
      const errorResponse = createMockResponse({
        status: 404,
        statusText: 'Not Found',
        ok: false
      });
      
      vi.mocked(global.fetch).mockResolvedValueOnce(errorResponse);
      
      await expect(toolCallback({ url: 'https://example.com/not-found' }, mockExtra))
        .rejects
        .toThrow('Failed to fetch https://example.com/not-found: HTTP error! status: 404');
    });
  });
}); 