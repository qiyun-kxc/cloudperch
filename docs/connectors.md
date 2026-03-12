# Connector Reference

CloudPerch uses a modular connector architecture. Each connector is an independent MCP server that handles a specific platform or capability.

## Connector Overview

| Connector | Language | Transport | Port | Tools |
|-----------|----------|-----------|------|-------|
| CloudPerch Browser | Node.js | SSE | 18081 | 8 |
| Bilibili | Go | SSE | 8080 | 3 |
| NetEase Cloud Music | Go | SSE | 8081 | 6 |
| Xiaohongshu (RedNote) | Node.js | SSE | 18060 | 13 |
| GitHub | Python (mcp-proxy) | SSE | 8083 | 70+ |

## Adding a New Connector

1. Build or install the MCP server
2. Configure it to listen on a local port
3. Start it with PM2: `pm2 start ./server --name my-connector`
4. Add an Nginx location block to route traffic
5. Register the connector URL in your MCP client

## Authentication

Most platform connectors require authentication tokens:

- **Bilibili**: No auth required for public search
- **NetEase**: No auth required for public search
- **Xiaohongshu**: Requires browser cookies (SESSDATA). Obtain via QR code login.
- **GitHub**: Uses a Personal Access Token configured in the server environment

## Key Lessons Learned

- **mcp-proxy**: When wrapping stdio-based MCP servers as SSE, use `mcp-proxy` with direct Nginx location blocks. Avoid prefix stripping in the proxy config.
- **mcp-go SSE**: Go SSE servers using the mcp-go library register routes at `/[path]/sse` when the base URL includes a path prefix. Configure Nginx accordingly.
- **eval_js**: For multi-statement JavaScript execution in CloudPerch, wrap code in an IIFE: `(() => { ... })()`
- **Timeout handling**: Platform connectors accessing Chinese services from overseas servers may timeout on first request. Implement automatic retries.
