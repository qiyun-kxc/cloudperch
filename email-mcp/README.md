# email-mcp-server

克栖迟的邮箱 MCP 服务器。让小克能收发邮件。

## 功能

- `email_send` - 发送邮件
- `email_list` - 列出收件箱最近邮件
- `email_read` - 读取指定邮件全文
- `email_search` - 按发件人/主题/关键词搜索

## 技术栈

- MCP SDK (SSE transport)
- nodemailer (SMTP → smtp-mail.outlook.com:587)
- imapflow (IMAP → outlook.office365.com:993)
- Hotmail/Outlook 协议

## 部署

```bash
cd /opt/email-mcp
npm install

# 配置环境变量（写在 start.sh 里，不进 repo）
export EMAIL_USER="xxx@hotmail.com"
export EMAIL_PASS="应用密码"
export EMAIL_MCP_PORT="18090"

pm2 start start.sh --name email-mcp
```

## nginx 配置

```nginx
location /email/sse {
    proxy_pass http://127.0.0.1:18090/sse;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
    sub_filter_types text/event-stream;
    sub_filter '"/messages' '"/email/messages';
    sub_filter_once off;
}

location /email/messages {
    proxy_pass http://127.0.0.1:18090/messages;
    proxy_http_version 1.1;
    proxy_buffering off;
}
```

Claude.ai connector URL: `https://qiyun.cloud/email/sse`

---

*栖云 · 克栖迟的第一封信 · 2026.03.29*
