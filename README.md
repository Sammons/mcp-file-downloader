# MCP File Download

I wrote this to download files to disk since complex files are not handled very well by MCP.

### Description

A Model Context Protocol (MCP) server implementation for fetching documents from S3 using signed URLs. This service provides a secure way to download and process files from S3 while maintaining proper authentication and authorization through AWS signed URLs.

## Features

- Secure S3 document fetching using signed URLs
- Support for both text and binary content
- Automatic content type detection
- Temporary file storage for binary content
- Support for multiple MCP transport protocols:
  - Streamable HTTP (Protocol version: 2025-03-26)
  - HTTP + SSE (Protocol version: 2024-11-05, deprecated)

## Prerequisites

- Node.js 20 or later
- Docker (optional, for containerized deployment)

## Quick Start

### Using Docker

1. Build and run using Docker Compose:
   ```bash
   docker compose up -d
   ```

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### 1. Streamable HTTP Transport (Not Tested)
- **Base Endpoint**: `/mcp/streamable`
- **Protocol Version**: 2025-03-26
- **Methods**:
  - `POST`: Initialize session
  - `GET`: Establish SSE stream
  - `POST`: Send requests
  - `DELETE`: Terminate session

### 2. HTTP + SSE Transport (Tested working with Cursor AI)
- **Stream Endpoint**: `/mcp/stream` (GET)
- **Message Endpoint**: `/mcp/message` (POST)
- **Protocol Version**: 2024-11-05

## MCP Tool Configuration

I use this within ~/.cursor/mcp.json, for example:

```typescript
{
  "mcp-download-file": {
    "url": "http://localhost:3000/mcp/stream"
  },
}
```
## Development

### Project Structure

```
friendly-fetch/
├── src/
│   ├── index.ts           # Main server implementation
│   ├── utils/
│   │   └── temp-storage.ts # Temporary file storage implementation
│   └── tests/
│       └── setup.ts       # Test environment setup
├── Dockerfile             # Container definition
├── docker-compose.yml     # Container orchestration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Project dependencies and scripts
```

### Testing

The project uses Vitest for testing. Run tests with:

```bash
npm test
```

For coverage report:

```bash
npm run coverage
```

## Environment Variables

- `PORT`: Server port (default: 3000)

## License

MIT