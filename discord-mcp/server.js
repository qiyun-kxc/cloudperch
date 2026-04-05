import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import crypto from 'crypto';

const PORT = process.env.PORT || 8084;
const SSE_MSG_PATH = process.env.SSE_MSG_PATH || "/messages";
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) { console.error('No DISCORD_TOKEN'); process.exit(1); }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
});
let botReady = false;
client.once('ready', () => { console.log(`Bot ready: ${client.user.tag}`); botReady = true; });
client.login(DISCORD_TOKEN);

const sessions = new Map();
const tools = [
  { name: 'discord_send_message', description: 'Send a message to a Discord channel', inputSchema: { type: 'object', properties: { channel_id: { type: 'string', description: 'Discord channel ID' }, content: { type: 'string', description: 'Message content' } }, required: ['channel_id', 'content'] } },
  { name: 'discord_read_messages', description: 'Read recent messages from a Discord channel', inputSchema: { type: 'object', properties: { channel_id: { type: 'string', description: 'Discord channel ID' }, limit: { type: 'number', description: 'Max messages (default 10, max 50)' } }, required: ['channel_id'] } },
];

async function handleToolCall(name, args) {
  if (!botReady) return { error: 'Bot not ready' };
  if (name === 'discord_send_message') {
    try { const ch = await client.channels.fetch(args.channel_id); const msg = await ch.send(args.content); return { success: true, message_id: msg.id }; }
    catch (e) { return { error: e.message }; }
  }
  if (name === 'discord_read_messages') {
    try { const ch = await client.channels.fetch(args.channel_id); const msgs = await ch.messages.fetch({ limit: Math.min(args.limit || 10, 50) }); return { messages: msgs.reverse().map(m => ({ id: m.id, author: m.author.tag, bot: m.author.bot, content: m.content, timestamp: m.createdAt.toISOString() })) }; }
    catch (e) { return { error: e.message }; }
  }
  return { error: 'Unknown tool' };
}

async function handleRPC(req) {
  const { id, method, params } = req;
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'discord-mcp', version: '1.0.0' } } };
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools } };
  if (method === 'tools/call') { const r = await handleToolCall(params.name, params.arguments); return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] } }; }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
}

const app = express();
app.use(express.json());

app.get('/sse', (req, res) => {
  const sid = crypto.randomUUID();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  sessions.set(sid, res);
  res.write(`event: endpoint\ndata: ${SSE_MSG_PATH}?sessionId=${sid}\n\n`);
  const ka = setInterval(() => res.write(': keepalive\n\n'), 30000);
  req.on('close', () => { clearInterval(ka); sessions.delete(sid); });
});

app.post('/sse', async (req, res) => {
  try { const r = await handleRPC(req.body); r ? res.json(r) : res.status(202).json({}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/messages', async (req, res) => {
  const s = sessions.get(req.query.sessionId);
  if (!s) return res.status(404).json({ error: 'No session' });
  try { const r = await handleRPC(req.body); if (r) s.write(`event: message\ndata: ${JSON.stringify(r)}\n\n`); res.status(202).json({}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/.well-known/oauth-protected-resource', (req, res) => res.json({}));
app.get('/.well-known/oauth-authorization-server', (req, res) => res.json({}));

app.listen(PORT, () => console.log(`Discord MCP running on ${PORT}`));
