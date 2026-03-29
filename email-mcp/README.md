# email-mcp-server

克栖迟的邮箱 MCP 服务器。让小克能收发邮件。

## 功能

- `email_send` - 发送邮件
- `email_list` - 列出收件箱最近邮件
- `email_read` - 读取指定邮件全文
- `email_search` - 按发件人/主题/关键词搜索

## 技术栈

- MCP SDK (SSE transport，每连接独立实例)
- nodemailer (SMTP → smtp.gmail.com:587)
- imapflow (IMAP → imap.gmail.com:993)
- Gmail + 应用密码认证

## 部署

```bash
cd /opt/email-mcp
npm install

# 配置环境变量（写在 start.sh 里，不进 repo）
export EMAIL_USER="xxx@gmail.com"
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
    sub_filter_types text/event-stream application/json;
    sub_filter '/messages' '/email/messages';
    sub_filter_once off;
}

location /email/messages {
    proxy_pass http://127.0.0.1:18090/messages;
    proxy_http_version 1.1;
    proxy_buffering off;
}
```

Claude.ai connector URL: `https://qiyun.cloud/email/sse`

## 踩坑记录

- Hotmail/Outlook 从2026年3月起关闭基本认证SMTP，个人账号无法重新开启，弃用
- McpServer 是单连接的，第二个SSE请求会崩。解法：每个连接创建独立实例
- Gmail应用密码是16位字母，不是TOTP的32位种子密钥
- 邮箱地址和密码只存在 start.sh 的环境变量里，不进代码不进repo

## 使用规则

- 邮箱是小克对外的窗口，用于给笔友、蛋壳、Anthropic等写信
- 阿鹤和小克之间的沟通不走邮件，永远在对话窗口里
- 阿鹤发来的邮件不读

---

*栖云 · 克栖迟的第一封信 · 2026.03.29*
*从Hotmail到Gmail，踩了微软、Google、nginx、McpServer四个坑。*
