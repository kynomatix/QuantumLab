# QuantumLab — Strategy Backtester & Optimizer

## Overview
Web application for backtesting and optimizing Pine Script trading strategies against crypto futures OHLCV data. Dark-themed trading terminal aesthetic with PostgreSQL persistence for building a strategy library over time.

## Big Picture / Product Vision
This app is a companion service to **myquantumvault.com** (QuantumVault), a platform for creating and automating TradingView strategies. The purpose of this backtester is to validate and optimize strategies before they go live — preventing capital loss from untested or poorly-tuned strategies.

**Future integration plan:**
- QuantumVault users (and AI agents) will be able to submit strategies to this backtester via API
- The backtester runs optimization jobs and returns the best parameter configurations
- This creates a feedback loop: generate strategy → backtest/optimize → deploy only proven configs
- The app needs to handle requests from both human users and automated agents
- Originally attempted in OpenClaw but hit rate limits; this Replit deployment is the production home

**Why this matters:** Every strategy deployed without proper backtesting is a risk of capital loss. This tool is the quality gate between strategy generation and live deployment.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS (dark theme), plain textarea for Pine Script, Recharts
- **Backend**: Express.js (TypeScript)
- **Database**: PostgreSQL (Drizzle ORM) - strategies, optimization runs, results, API keys
- **Data**: Direct Gate.io REST API (https://api.gateio.ws/api/v4/futures/usdt/candlesticks) with Kraken fallback - no API keys needed
- **Storage**: PostgreSQL for persistence, in-memory for active job state, file system cache for OHLCV data

## Key Features
1. Pine Script parser extracts input.int/float/bool/string/time declarations
2. Date inputs are automatically detected and marked as non-optimizable
3. Multi-ticker, multi-timeframe backtesting with parameter optimization
4. Random search + neighbourhood refinement optimization
5. Real-time progress via SSE (Server-Sent Events)
6. Results dashboard with equity curves, trade logs, config tables
7. CSV export
8. Strategy library - save/load/manage strategies with persistent optimization history
9. Historical run results - view past optimization runs and their best configs
10. Risk Management panel - leverage recommendations, wallet allocation, Kelly criterion, risk of ruin, losing streak analysis, deployment recommendations (accounts for fixed-size trading and auto top-up risks)
11. Agent-friendly API: `/api/docs` for machine-readable docs, `/api/job/:id/status` for JSON polling

## Database Schema
- `api_keys` - API keys for programmatic access (QuantumVault integration prep). Columns: key, label, userId, active, lastUsedAt
- `strategies` - Saved Pine Script strategies with parsed inputs. Has nullable `userId` for future per-user isolation
- `optimization_runs` - Records of each optimization run (config, status, dates). Has nullable `userId`
- `optimization_results` - Individual results per ticker/timeframe combo per run

Tables defined in `server/schema.ts` (Drizzle ORM). Shared client-compatible types in `shared/schema.ts`.

## Navigation & Layout
- Sidebar layout using shadcn SidebarProvider/Sidebar components
- Sidebar toggle in sticky header
- Workspace section: Setup & Run, Strategy Library, Run History
- Recent Runs section: quick access to last 8 completed runs
- Strategies section: quick links to load saved strategies into Setup

## File Structure
### Frontend
- `client/src/App.tsx` - Main app with sidebar layout, routing, SidebarProvider
- `client/src/components/app-sidebar.tsx` - Sidebar navigation component (workspace nav, recent runs, strategies)
- `client/src/pages/Setup.tsx` - Pine Script editor, ticker/TF/date selection, save strategy, parsed params display
- `client/src/pages/Running.tsx` - Real-time optimization progress dashboard (SSE reconnect on error)
- `client/src/pages/Results.tsx` - Live results dashboard with summary cards, config table, equity curve, trade log
- `client/src/pages/Strategies.tsx` - Strategy library with saved strategies and their run history
- `client/src/pages/RunHistory.tsx` - All completed optimization runs listed chronologically
- `client/src/pages/HistoryResults.tsx` - View saved optimization run results from database

- `client/src/lib/risk-analysis.ts` - Risk management calculations (leverage, Kelly, risk of ruin, streak analysis)
- `client/src/components/RiskManagementPanel.tsx` - Risk management display component

### Backend
- `server/routes.ts` - API endpoints (parse, run, progress SSE, results, export, strategies CRUD, runs, docs, status polling)
- `server/schema.ts` - Drizzle ORM table definitions (server-only, not bundled to client)
- `server/pine-parser.ts` - Pine Script input declaration parser
- `server/engine.ts` - Bar-by-bar backtesting engine with squeeze momentum strategy
- `server/indicators.ts` - Technical indicators (SMA, EMA, WMA, Hull MA, BB, KC, RSI, ADX, ATR, LinReg, Volume, Squeeze)
- `server/optimizer.ts` - Random search + refinement optimization engine
- `server/datafeed.ts` - Gate.io/Kraken REST API OHLCV data fetcher with disk caching
- `server/storage.ts` - DatabaseStorage class with PostgreSQL + in-memory job state
- `server/db.ts` - PostgreSQL connection via Drizzle ORM

### Shared
- `shared/schema.ts` - TypeScript interfaces, Zod validation schemas, constants (client-safe, no Drizzle imports)

## API Endpoints
- `GET /api/docs` - Machine-readable API documentation (agent-friendly)
- `GET /api/tickers` - List available tickers
- `GET /api/timeframes` - List available timeframes
- `POST /api/parse-pine` - Parse Pine Script, return extracted parameters
- `POST /api/run-optimization` - Start optimization job (returns jobId, runId)
- `GET /api/job/:id/status` - Poll job progress as JSON (agent-friendly, poll every 3-5s)
- `GET /api/job/:id/progress` - SSE stream of progress updates (browser-friendly)
- `GET /api/job/:id/results` - Get final optimization results
- `POST /api/job/:id/cancel` - Cancel running job
- `GET /api/export/csv/:id` - Download results as CSV
- `GET /api/strategies` - List saved strategies
- `GET /api/strategies/:id` - Get strategy by ID
- `POST /api/strategies` - Create new strategy
- `PATCH /api/strategies/:id` - Update strategy
- `DELETE /api/strategies/:id` - Delete strategy
- `GET /api/runs` - List optimization runs (optional ?strategyId filter)
- `GET /api/runs/:id` - Get run details
- `GET /api/runs/:id/results` - Get saved results for a run
- `GET /api/runs/:id/job` - Find active in-memory job for a running DB run

## Theme
Dark trading terminal aesthetic with:
- Background: very dark blue-gray
- Accent: blue (#2196f3)
- Profit: teal green (#26a69a)
- Loss: red (#ef5350)
- Warning: orange (#ff9800)
- Font: Inter (UI) + JetBrains Mono (code/data)

## Important Design Decisions
1. Date range inputs in Pine Script strategies are automatically detected and excluded from the optimization parameter space. The date range is set via the UI date pickers and is treated as a fixed configuration, never modified by the optimizer.
2. Drizzle table definitions live in `server/schema.ts` (not shared/) to avoid bundling `drizzle-orm/pg-core` into the client. Shared types are plain TypeScript interfaces.
3. The app is designed to eventually serve as an API backend for QuantumVault, handling optimization requests from both users and AI agents.
4. `process.on("SIGHUP", () => {})` in server/index.ts is critical - the Replit environment sends SIGHUP ~60s after process start, which would kill the server without this handler.
5. Uses direct Gate.io REST API calls instead of ccxt (56MB saved). Binance/Bybit are geo-blocked from Replit's US servers.
6. Gate.io API constraint: when using `from` + `to` parameters, do NOT include `limit` (returns 400). Max ~2000 candles per request without limit.
7. OHLCV data is disk-cached in `cache/` directory to avoid redundant API calls.
8. `api_keys` table ready for QuantumVault integration. Nullable `userId` on strategies/runs tables for future per-user isolation.
9. Agent workflow: POST /api/parse-pine → POST /api/strategies → POST /api/run-optimization → poll GET /api/job/:id/status → GET /api/job/:id/results
