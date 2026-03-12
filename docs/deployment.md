# Deployment Guide

This guide walks through deploying CloudPerch on a cloud server.

## Prerequisites

- A Linux server (Ubuntu 22.04+ recommended) with at least 2 vCPU and 4GB RAM
- A domain name pointed to your server's IP
- Node.js 20+, Go 1.22+, Python 3.11+
- Nginx and Certbot for TLS

## 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
npm install -g pm2

# Install Playwright dependencies
npx playwright install --with-deps chromium
```

## 2. CloudPerch Browser MCP

The core browser automation server runs as an Express + MCP SDK application with Playwright.

```bash
cd /opt/cloudperch
npm install
pm2 start index.js --name cloudperch
```

Default port: `18081`

## 3. Nginx Configuration

Each MCP server gets its own location block under a single domain:

```nginx
server {
    listen 443 ssl;
    server_name qiyun.cloud;

    ssl_certificate /etc/letsencrypt/live/qiyun.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qiyun.cloud/privkey.pem;

    # CloudPerch Browser
    location /mcp {
        proxy_pass http://127.0.0.1:18081;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
    }

    # Bilibili MCP
    location /bilibili/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
    }

    # Additional connectors follow the same pattern...
}
```

## 4. SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d qiyun.cloud
```

## 5. Process Management

All services are managed by PM2:

```bash
pm2 status           # Check all running services
pm2 logs cloudperch  # View CloudPerch logs
pm2 restart all      # Restart everything
pm2 save             # Save process list for auto-restart
pm2 startup          # Enable auto-start on boot
```

## 6. Connecting to claude.ai

Once deployed, add your server as a custom MCP connector in Claude's settings:

- **Name**: CloudPerch
- **URL**: `https://qiyun.cloud/mcp`

The browser tools will be available immediately in your conversations.

## Troubleshooting

- **SSE connection drops**: Ensure Nginx has `proxy_buffering off` and `proxy_cache off`
- **Playwright crashes**: Check available memory with `free -h`; Chromium needs ~500MB
- **MCP timeout**: Tokyo-region servers may have higher latency to Chinese platforms; retries usually succeed
