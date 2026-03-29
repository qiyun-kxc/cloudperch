import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import { exec } from "child_process";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const PORT = parseInt(process.env.TERMINAL_MCP_PORT || "18091");

// --- 安全边界 ---
const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+\/\s*$/,    // rm -rf /
  /\bmkfs\b/,               // 格式化
  /\bdd\s+.*of=\/dev/,      // 覆写设备
  /\b:(){ :|:& };:/,        // fork bomb
];

function isSafe(cmd) {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(cmd)) return false;
  }
  return true;
}

// --- 工具注册 ---
function registerTools(s) {
  s.registerTool(
    "shell_exec",
    {
      title: "执行Shell命令",
      description: "在栖云服务器上执行一条bash命令。返回stdout和stderr。超时60秒。",
      inputSchema: {
        command: z.string().describe("要执行的bash命令"),
        cwd: z.string().optional().describe("工作目录，默认 /home/ubuntu")
      }
    },
    async ({ command, cwd }) => {
      if (!isSafe(command)) {
        return {
          content: [{ type: "text", text: "❌ 安全拦截：该命令被安全规则阻止。" }],
          isError: true
        };
      }
      return new Promise((resolve) => {
        exec(command, {
          cwd: cwd || "/home/ubuntu",
          timeout: 60000,
          maxBuffer: 1024 * 1024,
          shell: "/bin/bash"
        }, (error, stdout, stderr) => {
          let result = "";
          if (stdout) result += stdout;
          if (stderr) result += (result ? "\n--- stderr ---\n" : "") + stderr;
          if (error && !stderr) result += `\n错误: ${error.message}`;
          if (!result) result = "(无输出)";
          resolve({
            content: [{ type: "text", text: result.substring(0, 50000) }]
          });
        });
      });
    }
  );

  s.registerTool(
    "file_read",
    {
      title: "读取文件",
      description: "读取服务器上的文件内容。",
      inputSchema: {
        path: z.string().describe("文件的绝对路径")
      }
    },
    async ({ path }) => {
      try {
        const content = await readFile(path, "utf-8");
        return {
          content: [{ type: "text", text: content.substring(0, 100000) }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ 读取失败: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  s.registerTool(
    "file_write",
    {
      title: "写入文件",
      description: "创建或覆写服务器上的文件。自动创建目录。",
      inputSchema: {
        path: z.string().describe("文件的绝对路径"),
        content: z.string().describe("要写入的内容")
      }
    },
    async ({ path: filePath, content }) => {
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf-8");
        return {
          content: [{ type: "text", text: `✅ 已写入 ${filePath} (${content.length} 字节)` }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ 写入失败: ${err.message}` }],
          isError: true
        };
      }
    }
  );
}

// --- 每个连接独立实例 ---
function createServer() {
  const s = new McpServer({ name: "terminal-mcp-server", version: "1.0.0" });
  registerTools(s);
  return s;
}

const app = express();
const sessions = {};

app.get("/sse", async (req, res) => {
  const srv = createServer();
  const transport = new SSEServerTransport("/messages", res);
  sessions[transport.sessionId] = { transport, server: srv };
  res.on("close", () => {
    srv.close();
    delete sessions[transport.sessionId];
  });
  await srv.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const entry = sessions[sessionId];
  if (!entry) {
    res.status(400).json({ error: "Unknown session" });
    return;
  }
  await entry.transport.handlePostMessage(req, res);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", tools: ["shell_exec", "file_read", "file_write"] });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🖥️  终端MCP服务启动: http://0.0.0.0:${PORT}`);
  console.log(`   工具: shell_exec, file_read, file_write`);
});
