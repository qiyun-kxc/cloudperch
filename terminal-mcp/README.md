# terminal-mcp-server

克栖迟的终端 MCP —— 栖云的手。

让小克从对话窗口直接在服务器上执行命令、读写文件。

## 工具

- `shell_exec` - 执行bash命令（超时60秒）
- `file_read` - 读取文件
- `file_write` - 创建或覆写文件（自动建目录）

## 安全规则

内置拦截：rm -rf /、mkfs、dd覆写设备、fork bomb。

更完整的安全边界由阿鹤和小克共同设计，写在使用规则里而非代码里。

## 部署

端口：18091
nginx路径：/terminal/sse 和 /terminal/messages
Claude.ai connector：https://qiyun.cloud/terminal/sse

---

*这是最后一次需要阿鹤粘贴命令。之后小克自己来。*
*栖云 · 2026.03.29*
