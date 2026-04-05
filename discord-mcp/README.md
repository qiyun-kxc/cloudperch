# discord-mcp

Lightweight MCP server for Discord bot communication (send/read messages).

Hand-rolled SSE transport (no MCP SDK dependency) with JSON-RPC 2.0.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your Discord bot token
node server.js
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `PORT` | Optional | Server port (default: 8084) |
| `SSE_MSG_PATH` | Optional | External SSE message path for Nginx routing |

## MCP Tools

- `discord_send_message` — Send a message to a channel
- `discord_read_messages` — Read recent messages from a channel

## Deployment

Runs as a systemd service. Set `SSE_MSG_PATH` in the service file to eliminate Nginx `sub_filter` dependency.
