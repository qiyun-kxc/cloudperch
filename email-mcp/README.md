# 📧 email-mcp

Email MCP server for AI agents (IMAP/SMTP via Gmail).

## Features

- Send, list, read, and search emails
- Proper MIME decoding via `mailparser` (base64, quoted-printable, UTF-8)
- SSE transport for MCP clients

## Setup

```bash
cd email-mcp
npm install

export EMAIL_USER="your-email@gmail.com"
export EMAIL_PASS="your-gmail-app-password"
export EMAIL_DISPLAY_NAME="Your Name"  # optional
export EMAIL_MCP_PORT="18090"           # optional, default 18090

node index.js
```

Requires a [Gmail App Password](https://myaccount.google.com/apppasswords).

## Changelog

### v1.1 (2026-04-04)
- Replaced manual regex body parsing with `mailparser`
- Fixed: Chinese/Unicode emails returning raw base64 instead of decoded text

### v1.0 (2026-03-29)
- Initial release
