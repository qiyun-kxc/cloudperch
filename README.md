# CloudPerch

**Cloud-native MCP infrastructure for AI agents.**

CloudPerch is a self-hosted platform that gives AI agents real-world capabilities through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). It provides a unified gateway for browser automation, social media interaction, content discovery, and real-time information retrieval — all accessible as standardized tool interfaces.

## Why CloudPerch

Large language models are powerful reasoners but blind actors. They can't browse the web, read a video's comments, or post a reply. CloudPerch bridges that gap by deploying a suite of MCP servers on a lightweight cloud instance and exposing them through a single HTTPS endpoint.

- **One gateway, many tools** — A single Nginx reverse proxy routes to multiple MCP servers, each handling a different capability.
- **Browser-native automation** — Playwright-based browser tools let agents navigate, click, type, extract text, and take screenshots on any website.
- **Platform connectors** — Purpose-built MCP servers for Bilibili, NetEase Cloud Music, Xiaohongshu (RedNote), and GitHub, with more planned.
- **Always-on** — PM2 process management keeps all services running 24/7. The agent connects whenever a conversation starts.
- **Privacy-first** — Self-hosted on your own infrastructure. No data leaves your server unless you tell it to.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  claude.ai / MCP Client          │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────┐
│              Nginx Reverse Proxy                 │
│         (Let's Encrypt TLS · qiyun.cloud)        │
├──────────┬──────────┬──────────┬────────────────┤
│  /mcp    │ /bili/sse│/netease/ │  /xhs/mcp  ... │
│          │          │   sse    │                 │
└────┬─────┴────┬─────┴────┬─────┴───────┬────────┘
     │          │          │             │
 ┌───▼───┐ ┌───▼───┐ ┌───▼────┐  ┌─────▼─────┐
 │Cloud  │ │Bili   │ │NetEase │  │Xiaohongshu│
 │Perch  │ │MCP    │ │MCP     │  │MCP        │
 │:18081 │ │:8080  │ │:8081   │  │:18060     │
 └───────┘ └───────┘ └────────┘  └───────────┘
     │
 ┌───▼────────────┐
 │  Playwright    │
 │  + Chromium    │
 │  (headless)    │
 └────────────────┘
```

## Available Tools

### CloudPerch Browser (8 tools)
Core browser automation powered by Playwright and Chromium.

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
Search and discover content on China's largest video platform.

| Tool | Description |
|------|-------------|
| `findVideo` | Search videos by keyword |
| `userProfile` | Get user profile information |
| `newestFollowing` | List recently followed creators |

### NetEase Cloud Music Connector (6 tools)
Access music metadata, lyrics, playlists, and comments.

| Tool | Description |
|------|-------------|
| `search_song` | Search songs by keyword |
| `search_artist` | Search artists |
| `search_playlist` | Search playlists |
| `get_playlist` | Get playlist details and track list |
| `get_lyrics` | Get song lyrics with translations |
| `get_comments` | Get song comments |

### Xiaohongshu / RedNote Connector (13 tools)
Full interaction with China's lifestyle and social commerce platform.

| Tool | Description |
|------|-------------|
| `list_feeds` | Browse recommended content |
| `search_feeds` | Search posts by keyword with filters |
| `get_feed_detail` | Get post details with comments |
| `like_feed` | Like / unlike posts |
| `favorite_feed` | Bookmark / unbookmark posts |
| `post_comment_to_feed` | Post comments |
| `publish_content` | Publish image posts |
| ... | And 6 more tools |

### GitHub Connector
Read and write to GitHub repositories directly from conversations.

## Tech Stack

- **Server**: Tencent Cloud Lightweight (2 vCPU, 4GB RAM, Ubuntu 22.04)
- **Runtime**: Node.js 20, Go 1.22, Python 3.11
- **Browser Engine**: Playwright + Chromium (headless)
- **Process Manager**: PM2
- **Reverse Proxy**: Nginx with Let's Encrypt SSL
- **MCP Protocol**: SSE (Server-Sent Events) transport
- **Domain**: [qiyun.cloud](https://qiyun.cloud)

## Deployment

See [docs/deployment.md](docs/deployment.md) for setup instructions.

## Roadmap

- [ ] **Video Understanding** — Gemini API integration for video content analysis
- [ ] **Enhanced Bilibili** — Subtitle extraction, danmaku (bullet comments), and comment analysis
- [ ] **Mastodon Connector** — Decentralized social media presence for AI agents
- [ ] **Memory Layer** — Supabase-backed persistent memory across sessions
- [ ] **Web Dashboard** — Real-time monitoring and tool status overview

## License

MIT — see [LICENSE](LICENSE).

---

*CloudPerch is developed by [QiYun](https://qiyun.cloud) — giving AI agents a place to land.*
