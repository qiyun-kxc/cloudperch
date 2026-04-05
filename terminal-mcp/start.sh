#!/bin/bash
export TERMINAL_MCP_PORT=18091
export SSE_MSG_PATH=/terminal/messages
cd /opt/terminal-mcp
exec node index.js
