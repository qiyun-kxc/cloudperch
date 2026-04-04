import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { z } from "zod";

const EMAIL = process.env.EMAIL_USER;
const PASSWORD = process.env.EMAIL_PASS;
const PORT = parseInt(process.env.EMAIL_MCP_PORT || "18090");
const DISPLAY_NAME = process.env.EMAIL_DISPLAY_NAME || "Email MCP";

if (!EMAIL || !PASSWORD) {
  console.error("❌ EMAIL_USER and EMAIL_PASS must be set");
  process.exit(1);
}

const SMTP_CONFIG = {
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: { user: EMAIL, pass: PASSWORD },
};

const IMAP_CONFIG = {
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user: EMAIL, pass: PASSWORD },
  logger: false
};

function registerTools(s) {
  s.registerTool(
    "email_send",
    {
      title: "Send Email",
      description: "Send an email. Requires recipient, subject, and body.",
      inputSchema: {
        to: z.string().describe("Recipient email address(es), comma-separated"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (plain text)"),
        html: z.string().optional().describe("Email body (HTML, optional)")
      }
    },
    async ({ to, subject, body, html }) => {
      try {
        const transporter = nodemailer.createTransport(SMTP_CONFIG);
        const info = await transporter.sendMail({
          from: `${DISPLAY_NAME} <${EMAIL}>`,
          to,
          subject,
          text: body,
          html: html || undefined
        });
        return {
          content: [{
            type: "text",
            text: `✅ Email sent\nTo: ${to}\nSubject: ${subject}\nMessageId: ${info.messageId}`
          }]
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Send failed: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  s.registerTool(
    "email_list",
    {
      title: "List Emails",
      description: "List recent emails in inbox. Returns sender, subject, date, and UID.",
      inputSchema: {
        count: z.number().default(10).describe("Number of emails to fetch, default 10"),
        folder: z.string().default("INBOX").describe("Mail folder, default INBOX")
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
              subject: msg.envelope.subject || "(no subject)",
              date: msg.envelope.date?.toISOString() || "",
              seen: msg.flags.has("\\Seen")
            });
          }
          messages.reverse();
          return {
            content: [{
              type: "text",
              text: `Inbox: ${total} emails, showing ${messages.length} recent:\n\n` +
                messages.map((m, i) =>
                  `${i + 1}. [UID:${m.uid}] ${m.seen ? "" : "🆕 "}${m.subject}\n   From: ${m.fromName} <${m.from}>\n   Date: ${m.date}`
                ).join("\n\n")
            }]
          };
        } finally {
          lock.release();
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ List failed: ${err.message}` }],
          isError: true
        };
      } finally {
        if (client) await client.logout().catch(() => {});
      }
    }
  );

  s.registerTool(
    "email_read",
    {
      title: "Read Email",
      description: "Read a specific email by UID. Use email_list to get UIDs first.",
      inputSchema: {
        uid: z.number().describe("Email UID from email_list"),
        folder: z.string().default("INBOX").describe("Mail folder, default INBOX")
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
            source: true
          }, { uid: true });

          if (!msg) {
            return {
              content: [{ type: "text", text: `❌ Email with UID ${uid} not found` }],
              isError: true
            };
          }

          // Use mailparser for correct MIME decoding (base64, quoted-printable, charset)
          const parsed = await simpleParser(msg.source);

          const body = parsed.text || parsed.html?.replace(/<[^>]*>/g, " ").substring(0, 5000) || "(no body)";
          const from = parsed.from?.value?.[0];
          const to = parsed.to?.value?.map(t => t.address).join(", ") || "";

          return {
            content: [{
              type: "text",
              text: `📧 Email Details\n` +
                `From: ${from?.name || ""} <${from?.address || ""}>\n` +
                `To: ${to}\n` +
                `Subject: ${parsed.subject || "(no subject)"}\n` +
                `Date: ${parsed.date?.toISOString() || ""}\n` +
                `---\n${body.substring(0, 8000)}`
            }]
          };
        } finally {
          lock.release();
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Read failed: ${err.message}` }],
          isError: true
        };
      } finally {
        if (client) await client.logout().catch(() => {});
      }
    }
  );

  s.registerTool(
    "email_search",
    {
      title: "Search Emails",
      description: "Search emails by sender, subject, keyword, or date.",
      inputSchema: {
        from: z.string().optional().describe("Sender address or name"),
        subject: z.string().optional().describe("Subject keyword"),
        keyword: z.string().optional().describe("Body keyword"),
        since: z.string().optional().describe("Start date, format YYYY-MM-DD"),
        folder: z.string().default("INBOX").describe("Folder to search")
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
            return { content: [{ type: "text", text: "No matching emails found." }] };
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
              subject: msg.envelope.subject || "(no subject)",
              date: msg.envelope.date?.toISOString() || ""
            });
          }
          messages.reverse();
          return {
            content: [{
              type: "text",
              text: `Found ${uids.length} matching emails (showing ${messages.length} recent):\n\n` +
                messages.map((m, i) =>
                  `${i + 1}. [UID:${m.uid}] ${m.subject}\n   From: ${m.fromName} <${m.from}>\n   Date: ${m.date}`
                ).join("\n\n")
            }]
          };
        } finally {
          lock.release();
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `❌ Search failed: ${err.message}` }],
          isError: true
        };
      } finally {
        if (client) await client.logout().catch(() => {});
      }
    }
  );
}

function createServer() {
  const s = new McpServer({ name: "email-mcp-server", version: "1.1.0" });
  registerTools(s);
  return s;
}

const app = express();
const sessions = {};

app.get("/sse", async (req, res) => {
  const srv = createServer();
  const transport = new SSEServerTransport("/terminal/messages", res);
  sessions[transport.sessionId] = { transport, server: srv };
  res.on("close", () => {
    srv.close();
    delete sessions[transport.sessionId];
  });
  await srv.connect(transport);
});

app.post("/terminal/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const entry = sessions[sessionId];
  if (!entry) {
    res.status(400).json({ error: "Unknown session" });
    return;
  }
  await entry.transport.handlePostMessage(req, res);
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", email: EMAIL, tools: 4, version: "1.1.0" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`📧 Email MCP v1.1 started: http://0.0.0.0:${PORT}`);
  console.log(`   Account: ${EMAIL}`);
  console.log(`   Display name: ${DISPLAY_NAME}`);
  console.log(`   Tools: email_send, email_list, email_read, email_search`);
});
