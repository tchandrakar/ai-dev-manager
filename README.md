# AI Dev Manager

A unified desktop application suite built with Electron + Vite + React, featuring three integrated AI-powered developer tools.

## Apps

### Sharingan — PR Review Agent
AI-powered pull request diff reviewer. Connects to GitHub/GitLab, fetches PR diffs, and runs configurable AI agents to produce structured code reviews.

### KawaiiDB — Database Manager
JetBrains DataGrip-style database GUI. Supports PostgreSQL, MySQL, MongoDB, Redis, SQLite, SQL Server, MariaDB, and Oracle. Features connection management, a SQL editor, table browser, ER diagrams, performance dashboard, and an AI query optimizer.

### Shinra Tensei — Lightweight IDE
JetBrains-inspired IDE. Includes a syntax-highlighted code editor with minimap and terminal, visual debugger with APM metrics, AI assistant (Claude-powered), dependency/call graph diagrams, plugin manager, Search Everywhere overlay, and run configuration manager.

## Tech Stack

- **Electron Forge** — packaging and distribution
- **Vite 5** — renderer bundling (HMR in dev)
- **React 18** — UI
- **Design tokens** — consistent dark theme via `src/renderer/tokens.js`
- **Real DB drivers** — `pg`, `mysql2`, `mongodb`, `ioredis`, `better-sqlite3`, `tedious`

## Project Structure

```
akatsuki-app/
├── src/
│   ├── main/main.js          # Electron main process + IPC handlers
│   ├── preload/preload.js    # Context bridge (window.akatsuki.*)
│   └── renderer/
│       ├── tokens.js         # Design tokens (T.*)
│       ├── components.jsx    # Shared components (Btn, Badge, PanelHeader, …)
│       ├── App.jsx           # App router (?app= param)
│       ├── kawaiidb/         # KawaiiDB screens
│       └── shinra/           # Shinra Tensei screens
├── index.html                # Browser dev mock (window.akatsuki no-ops)
├── forge.config.cjs          # Electron Forge config
└── .claude/launch.json       # Dev server configs
```

## Development

```bash
cd akatsuki-app
npm install

# Run in Electron
npm start

# Preview renderer in browser (no Electron needed)
# Uses kawaiidb-renderer or akatsuki-renderer configs in .claude/launch.json
```

## Design Mockups

SVG mockups for all three apps are in the repo root:
- `preview.html` — Sharingan screens
- `preview-kawaiidb.html` — KawaiiDB screens
- `preview-ide.html` — Shinra Tensei screens
