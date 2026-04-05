import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import { exec } from "child_process";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const PORT = parseInt(process.env.TERMINAL_MCP_PORT || "18091");
const SSE_MSG_PATH = process.env.SSE_MSG_PATH || "/messages";

// --- Safety rules ---
const BLOCKED_COMMANDS = [
  /\brm\s+-rf\s+\/\s*$/,    // rm -rf /
  /\bmkfs\b/,               // format
  /\bdd\s+.*of=\/dev/,      // overwrite device
  /\b:(){ :|:& };:/,        // fork bomb
];

function isSafe(cmd) {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(cmd)) return false;
  }
  return true;
}

function registerTools(s) {
  s.registerTool(
    "shell_exec",
    {
      title: "Execute Shell Command",
      description: "Execute a bash command on the server. Returns stdout and stderr. Timeout 60s.",
      inputSchema: {
        command: z.string().describe("Bash command to execute"),
        cwd: z.string().optional().describe("Working directory, default /home/ubuntu")
      }
    },
    async ({ command, cwd }) => {
      if (!isSafe(command)) {
        return {
          content: [{ type: "text", text: "Blocked: command matched a safety rule." }],
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
          if (error && !stderr) result += `\nError: ${error.message}`;
          if (!result) result = "(no output)";
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
      title: "Read File",
      description: "Read file contents from the server.",
      inputSchema: {
        path: z.string().describe("Absolute file path")
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
          content: [{ type: "text", text: `Read failed: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  s.registerTool(
    "file_write",
    {
      title: "Write File",
      description: "Create or overwrite a file on the server. Auto-creates directories.",
      inputSchema: {
        path: z.string().describe("Absolute file path"),
        content: z.string().describe("Content to write")
      }
    },
    async ({ path: filePath, content }) => {
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf-8");
        return {
          content: [{ type: "text", text: `Written ${filePath} (${content.length} bytes)` }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Write failed: ${err.message}` }],
          isError: true
        };
      }
    }
  );
}

function createServer() {
  const s = new McpServer({ name: "terminal-mcp-server", version: "1.0.0" });
  registerTools(s);
  return s;
}

const app = express();
const sessions = {};

app.get("/sse", async (req, res) => {
  const srv = createServer();
  const transport = new SSEServerTransport(SSE_MSG_PATH, res);
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
  console.log(`Terminal MCP started: http://0.0.0.0:${PORT}`);
  console.log(`  SSE path: ${SSE_MSG_PATH}`);
  console.log(`  Tools: shell_exec, file_read, file_write`);
});
