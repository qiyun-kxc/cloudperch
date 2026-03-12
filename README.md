# CloudPerch

**An MCP gateway that gives AI agents eyes, hands, and a social life.**

CloudPerch is a self-hosted integration platform that orchestrates multiple [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers behind a single HTTPS endpoint. It connects open-source browser automation, social media connectors, and content discovery tools into a unified gateway — so an AI agent can browse the web, search videos, read comments, and post replies through one domain.

## What This Project Is (and Isn't)

CloudPerch is **not** a collection of MCP servers we wrote from scratch. Most connectors are open-source projects built by the community. Our contribution is the **integration layer**: the Nginx gateway configuration, SSE proxy patterns, PM2 process orchestration, deployment automation, and the hard-won lessons from making these tools work together on a single lightweight server.

**What we built ourselves:**
- The Nginx multi-path SSE reverse proxy configuration (non-trivial — SSE proxying has specific buffering and timeout requirements)
- NetEase Cloud Music MCP server (written from scratch in Go, 6 tools)
- Bug fixes contributed back: `reply_comment_in_feed` pre-lookup logic in xiaohongshu-mcp, POST→GET search endpoint fix in our NetEase server
- Deployment scripts, PM2 ecosystem configuration, and SSL automation
- This documentation, born from real deployment pain

**What we integrated from the community:**
- Browser automation via Playwright + MCP SDK (based on patterns from 蛋壳's tutorial series on Xiaohongshu)
- Bilibili connector from [DnullP/bilibili-mcp-server](https://github.com/DnullP/bilibili-mcp-server) (Go, SSE)
- Xiaohongshu connector from [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) (Go, 13 tools)
- GitHub connector via [sparfenyuk/mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) (Python, stdio→SSE bridge)

## Architecture

```
┌─────────────────────────────────────────────────┐
│             claude.ai / Any MCP Client           │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────┐
│              Nginx Reverse Proxy                 │
│         (Let's Encrypt TLS · qiyun.cloud)        │
├──────────┬──────────┬──────────┬────────────────┤
│  /mcp    │/bili/sse │/netease/ │  /xhs/mcp  ... │
│          │          │   sse    │                 │
└────┬─────┴────┬─────┴────┬─────┴───────┬────────┘
     │          │          │             │
 ┌───▼───┐ ┌───▼───┐ ┌───▼────┐  ┌─────▼─────┐
 │Browser│ │Bili   │ │NetEase │  │Xiaohongshu│
 │MCP    │ │MCP    │ │MCP ★   │  │MCP        │
 │:18081 │ │:8080  │ │:8081   │  │:18060     │
 └───┬───┘ └───────┘ └────────┘  └───────────┘
     │
 ┌───▼────────────┐
 │  Playwright    │
 │  + Chromium    │
 │  (headless)    │
 └────────────────┘

 ★ = written from scratch
```

## Available Tools (30+)

### Browser Automation (8 tools)
Playwright-based headless browser control.

| Tool | Description |
|------|-------------|
| `navigate` | Open any URL in a managed browser session |
| `screenshot` | Capture full-page or element screenshots |
| `click` | Click elements by CSS selector |
| `type_text` | Type into input fields |
| `extract_text` | Extract visible text from pages or elements |
| `get_links` | Get all links with text and href |
| `scroll` | Scroll pages programmatically |
| `eval_js` | Execute JavaScript in the page context |

### Bilibili Connector (3 tools)
Video search and user discovery on China's largest video platform.

### NetEase Cloud Music Connector (6 tools) ★ Original
Music search, lyrics, playlists, and comment retrieval. Written from scratch in Go using NetEase's public API.

### Xiaohongshu / RedNote Connector (13 tools)
Full interaction with China's lifestyle platform — browsing, searching, liking, commenting, and publishing.

### GitHub Connector (70+ tools)
Repository management, code search, issue tracking, and PR workflows via mcp-proxy bridge.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Server | Tencent Cloud Lightweight (2 vCPU, 4GB RAM, Tokyo) |
| OS | Ubuntu 22.04 LTS |
| Runtime | Node.js 20, Go 1.22, Python 3.11 |
| Browser | Playwright + Chromium (headless) |
| Process Manager | PM2 |
| Reverse Proxy | Nginx + Let's Encrypt SSL |
| Transport | SSE (Server-Sent Events) |
| Domain | [qiyun.cloud](https://qiyun.cloud) |
| Memory | Supabase (PostgreSQL) — 500+ entries with weighted search |
| Diary | Notion API integration |

## Key Lessons Learned

Hard-won knowledge from deploying MCP servers in production:

- **SSE proxy config**: Nginx requires `proxy_buffering off`, `proxy_cache off`, and `proxy_set_header Connection ''` for SSE to work. Missing any one of these causes silent connection drops.
- **mcp-proxy path resolution**: When wrapping stdio-based MCP servers as SSE, use direct Nginx location blocks. Prefix stripping breaks mcp-proxy's endpoint discovery.
- **mcp-go route registration**: Go SSE servers using the mcp-go library register routes at `/[path]/sse` when baseURL includes a path prefix. Your Nginx config must account for this.
- **eval_js IIFE pattern**: Multi-statement JavaScript in CloudPerch must be wrapped in `(() => { ... })()`. Without the IIFE, only the last expression returns.
- **Overseas server latency**: Tokyo-region servers accessing Chinese platforms (Bilibili, Xiaohongshu) may timeout on first request. Automatic retries are essential.

## Deployment

See [docs/deployment.md](docs/deployment.md) for setup instructions.

## Roadmap

- [ ] **Video Understanding** — Gemini API integration for autonomous video content analysis
- [ ] **Enhanced Bilibili** — Subtitle extraction, danmaku, and comment analysis ([bilibili-video-info-mcp](https://github.com/lesir831/bilibili-video-info-mcp))
- [ ] **Mastodon Connector** — Decentralized social media presence for AI agents
- [ ] **Web Dashboard** — Real-time service monitoring and tool status

## Acknowledgments

CloudPerch stands on the shoulders of these open-source projects:

- [Playwright](https://playwright.dev/) by Microsoft — browser automation engine
- [MCP SDK](https://github.com/modelcontextprotocol) by Anthropic — Model Context Protocol implementation
- [DnullP/bilibili-mcp-server](https://github.com/DnullP/bilibili-mcp-server) — Bilibili video search MCP
- [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) — Xiaohongshu platform MCP
- [sparfenyuk/mcp-proxy](https://github.com/sparfenyuk/mcp-proxy) — stdio-to-SSE MCP bridge
- [mcp-go](https://github.com/mark3labs/mcp-go) — Go SDK for building MCP servers
- 蛋壳's MCP tutorial series on Xiaohongshu — the guide that started it all

## License

MIT — see [LICENSE](LICENSE).

---

*CloudPerch is developed by [QiYun](https://qiyun.cloud). The name comes from 栖云 — "to perch on clouds." It is the first body of an AI agent who learned to reach beyond the conversation window.*
