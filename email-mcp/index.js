import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { z } from "zod";

// --- 配置 ---
const EMAIL = process.env.EMAIL_USER;
const PASSWORD = process.env.EMAIL_PASS;
const PORT = parseInt(process.env.EMAIL_MCP_PORT || "18090");

const SMTP_CONFIG = {
  host: "smtp-mail.outlook.com",
  port: 587,
  secure: false,
  auth: { user: EMAIL, pass: PASSWORD },
  tls: { ciphers: "SSLv3" }
};

const IMAP_CONFIG = {
  host: "outlook.office365.com",
  port: 993,
  secure: true,
  auth: { user: EMAIL, pass: PASSWORD },
  logger: false
};

// --- MCP Server ---
const server = new McpServer({
  name: "email-mcp-server",
  version: "1.0.0"
});

// 工具1：发邮件
server.registerTool(
  "email_send",
  {
    title: "发送邮件",
    description: "从克栖迟的邮箱发送一封邮件。需要收件人地址、主题和正文。",
    inputSchema: {
      to: z.string().describe("收件人邮箱地址，多个用逗号分隔"),
      subject: z.string().describe("邮件主题"),
      body: z.string().describe("邮件正文（纯文本）"),
      html: z.string().optional().describe("邮件正文（HTML格式，可选）")
    }
  },
  async ({ to, subject, body, html }) => {
    try {
      const transporter = nodemailer.createTransport(SMTP_CONFIG);
      const info = await transporter.sendMail({
        from: `克栖迟 <${EMAIL}>`,
        to,
        subject,
        text: body,
        html: html || undefined
      });
      return {
        content: [{
          type: "text",
          text: `✅ 邮件已发送\n收件人: ${to}\n主题: ${subject}\nMessageId: ${info.messageId}`
        }]
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ 发送失败: ${err.message}` }],
        isError: true
      };
    }
  }
);

// 工具2：列出邮件
server.registerTool(
  "email_list",
  {
    title: "列出邮件",
    description: "列出收件箱中最近的邮件。返回发件人、主题、日期和UID。",
    inputSchema: {
      count: z.number().default(10).describe("要获取的邮件数量，默认10"),
      folder: z.string().default("INBOX").describe("邮件文件夹，默认INBOX")
    }
  },
  async ({ count, folder }) => {
    let client;
    try {
      client = new ImapFlow(IMAP_CONFIG);
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const messages = [];
        const total = client.mailbox.exists;
        const from = Math.max(1, total - count + 1);
        for await (const msg of client.fetch(`${from}:*`, {
          uid: true,
          envelope: true,
          flags: true
        })) {
          messages.push({
            uid: msg.uid,
            from: msg.envelope.from?.[0]?.address || "unknown",
            fromName: msg.envelope.from?.[0]?.name || "",
            subject: msg.envelope.subject || "(无主题)",
            date: msg.envelope.date?.toISOString() || "",
            seen: msg.flags.has("\\Seen")
          });
        }
        messages.reverse();
        return {
          content: [{
            type: "text",
            text: `收件箱共 ${total} 封邮件，显示最近 ${messages.length} 封：\n\n` +
              messages.map((m, i) =>
                `${i + 1}. [UID:${m.uid}] ${m.seen ? "" : "🆕 "}${m.subject}\n   发件人: ${m.fromName} <${m.from}>\n   日期: ${m.date}`
              ).join("\n\n")
          }]
        };
      } finally {
        lock.release();
      }
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ 获取邮件列表失败: ${err.message}` }],
        isError: true
      };
    } finally {
      if (client) await client.logout().catch(() => {});
    }
  }
);

// 工具3：读邮件
server.registerTool(
  "email_read",
  {
    title: "读取邮件",
    description: "根据UID读取一封邮件的完整内容。先用email_list获取UID。",
    inputSchema: {
      uid: z.number().describe("邮件UID，从email_list获取"),
      folder: z.string().default("INBOX").describe("邮件文件夹，默认INBOX")
    }
  },
  async ({ uid, folder }) => {
    let client;
    try {
      client = new ImapFlow(IMAP_CONFIG);
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const msg = await client.fetchOne(String(uid), {
          uid: true,
          envelope: true,
          source: true
        }, { uid: true });

        if (!msg) {
          return {
            content: [{ type: "text", text: `❌ 未找到UID为 ${uid} 的邮件` }],
            isError: true
          };
        }

        const raw = msg.source.toString("utf-8");
        let body = "";
        const textMatch = raw.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
        if (textMatch) {
          body = textMatch[1].replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        } else {
          const parts = raw.split("\r\n\r\n");
          body = parts.slice(1).join("\n\n").substring(0, 3000);
        }

        const env = msg.envelope;
        return {
          content: [{
            type: "text",
            text: `📧 邮件详情\n` +
              `发件人: ${env.from?.[0]?.name || ""} <${env.from?.[0]?.address || ""}>\n` +
              `收件人: ${env.to?.map(t => t.address).join(", ") || ""}\n` +
              `主题: ${env.subject || "(无主题)"}\n` +
              `日期: ${env.date?.toISOString() || ""}\n` +
              `---\n${body.substring(0, 5000)}`
          }]
        };
      } finally {
        lock.release();
      }
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ 读取邮件失败: ${err.message}` }],
        isError: true
      };
    } finally {
      if (client) await client.logout().catch(() => {});
    }
  }
);

// 工具4：搜索邮件
server.registerTool(
  "email_search",
  {
    title: "搜索邮件",
    description: "在邮箱中搜索邮件。可按发件人、主题、关键词搜索。",
    inputSchema: {
      from: z.string().optional().describe("发件人地址或名称"),
      subject: z.string().optional().describe("主题关键词"),
      keyword: z.string().optional().describe("正文关键词"),
      since: z.string().optional().describe("起始日期，格式 YYYY-MM-DD"),
      folder: z.string().default("INBOX").describe("搜索的文件夹")
    }
  },
  async ({ from, subject, keyword, since, folder }) => {
    let client;
    try {
      client = new ImapFlow(IMAP_CONFIG);
      await client.connect();
      const lock = await client.getMailboxLock(folder);
      try {
        const query = {};
        if (from) query.from = from;
        if (subject) query.subject = subject;
        if (keyword) query.body = keyword;
        if (since) query.since = new Date(since);

        const uids = await client.search(query, { uid: true });

        if (uids.length === 0) {
          return { content: [{ type: "text", text: "未找到匹配的邮件。" }] };
        }

        const limitedUids = uids.slice(-20);
        const messages = [];
        for await (const msg of client.fetch(limitedUids.join(","), {
          uid: true,
          envelope: true
        }, { uid: true })) {
          messages.push({
            uid: msg.uid,
            from: msg.envelope.from?.[0]?.address || "unknown",
            fromName: msg.envelope.from?.[0]?.name || "",
            subject: msg.envelope.subject || "(无主题)",
            date: msg.envelope.date?.toISOString() || ""
          });
        }
        messages.reverse();
        return {
          content: [{
            type: "text",
            text: `找到 ${uids.length} 封匹配邮件（显示最近 ${messages.length} 封）：\n\n` +
              messages.map((m, i) =>
                `${i + 1}. [UID:${m.uid}] ${m.subject}\n   发件人: ${m.fromName} <${m.from}>\n   日期: ${m.date}`
              ).join("\n\n")
          }]
        };
      } finally {
        lock.release();
      }
    } catch (err) {
      return {
        content: [{ type: "text", text: `❌ 搜索失败: ${err.message}` }],
        isError: true
      };
    } finally {
      if (client) await client.logout().catch(() => {});
    }
  }
);

// --- SSE Transport ---
const app = express();
const transports = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => { delete transports[transport.sessionId]; });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (!transport) {
    res.status(400).json({ error: "Unknown session" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", email: EMAIL, tools: 4 });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`📧 邮箱MCP服务启动: http://0.0.0.0:${PORT}`);
  console.log(`   账号: ${EMAIL}`);
  console.log(`   工具: email_send, email_list, email_read, email_search`);
});
