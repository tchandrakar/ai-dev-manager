# Akatsuki App

Electron + Vite + React desktop app housing three developer tools: **Sharingan**, **KawaiiDB**, and **Shinra Tensei**.

## Quick Start

```bash
npm install
npm start          # Electron app
npm run package    # Build distributable
```

## Dev Preview (browser, no Electron)

Launch configs are in `.claude/launch.json`. Use Claude Code's preview tools or run manually:

```bash
# Sharingan / Shinra
npx vite@5 . --port 5173

# KawaiiDB
npx vite@5 . --port 5174
# Then open: http://localhost:5174/?app=kawaiidb
```

Inject localStorage to bypass setup gate:

```js
localStorage.setItem('akatsuki:active-app', 'kawaiidb');
localStorage.setItem('kawaiidb:connections', JSON.stringify([...]));
```

## App Routing

The renderer uses a `?app=` URL param or `akatsuki:active-app` localStorage key:

| Value | App |
|-------|-----|
| *(default)* | Sharingan |
| `kawaiidb` | KawaiiDB |
| `shinra` | Shinra Tensei |

## IPC API (`window.akatsuki.*`)

All IPC is exposed via the context bridge in `preload.js`. Browser dev mocks in `index.html` return plausible responses without Electron.

### KawaiiDB
```js
window.akatsuki.kawaiidb.testConnection(opts)  // → { ok, msg, version }
window.akatsuki.kawaiidb.connect(opts)         // → { ok, msg, version }
window.akatsuki.kawaiidb.disconnect({ id })    // → { ok }
window.akatsuki.kawaiidb.query({ id, sql })    // → { ok, rows, columns, rowCount, time }
```

### Sharingan
```js
window.akatsuki.getWorkingDir()
window.akatsuki.openDir()
window.akatsuki.git.diff(options)
window.akatsuki.ai.review(options)
```

## Screens

### Sharingan
- `ScreenReview.jsx` — PR diff viewer + AI review panel
- `ScreenSettings.jsx` — Profile, AI agents, Git platform connections

### KawaiiDB
| Screen | File |
|--------|------|
| Connections | `kawaiidb/ScreenConnections.jsx` |
| Navigator (SQL editor / table browser / ER diagram) | `kawaiidb/ScreenNavigator.jsx` |
| Query editor | `kawaiidb/ScreenQuery.jsx` |
| Dashboard | `kawaiidb/ScreenDashboard.jsx` |
| AI Analyze | `kawaiidb/ScreenAIAnalyze.jsx` |
| History | `kawaiidb/ScreenHistory.jsx` |

### Shinra Tensei
| Screen | File |
|--------|------|
| Editor | `shinra/ScreenEditor.jsx` |
| Debugger | `shinra/ScreenDebugger.jsx` |
| AI Assistant | `shinra/ScreenAIAssistant.jsx` |
| Diagram | `shinra/ScreenDiagram.jsx` |
| Plugins | `shinra/ScreenPlugins.jsx` |
| Search Everywhere | `shinra/ScreenSearch.jsx` |
| Run Config | `shinra/ScreenRunConfig.jsx` |

## Design Tokens (`src/renderer/tokens.js`)

```js
T.bg0 / T.bg1 / T.bg2 / T.bg3 / T.bg4   // backgrounds (dark → light)
T.border / T.border2                       // borders
T.txt / T.txt2 / T.txt3                   // text (primary → muted)
T.teal / T.blue / T.green / T.amber       // accent colors
T.red / T.purple / T.cyan                 // accent colors
T.fontUI / T.fontMono                     // fonts
```

## Shared Components (`src/renderer/components.jsx`)

`Btn`, `Badge`, `Dot`, `Toggle`, `Spinner`, `PanelHeader`, `Input`, `StatusPill`

## Supported DB Drivers

| DB | Driver |
|----|--------|
| PostgreSQL | `pg` |
| MySQL / MariaDB | `mysql2` |
| MongoDB | `mongodb` |
| Redis | `ioredis` |
| SQLite | `better-sqlite3` |
| SQL Server | `tedious` |
