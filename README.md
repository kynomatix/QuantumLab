# QuantumLab

A web application for backtesting and optimizing Pine Script trading strategies against crypto futures data. Built as a companion tool to [QuantumVault](https://myquantumvault.com) for validating strategies before live deployment.

## What It Does

QuantumLab takes your TradingView Pine Script strategy, extracts its configurable parameters, and runs thousands of backtests across different parameter combinations to find the best-performing settings. It pulls real OHLCV candlestick data from Gate.io futures markets and simulates trades bar-by-bar, tracking entries, exits, take-profits, stop-losses, and trailing stops.

Instead of manually tweaking inputs in TradingView and waiting for each backtest, QuantumLab automates the entire process — testing hundreds or thousands of parameter combinations in minutes and ranking the results by net profit, win rate, drawdown, and profit factor.

## Key Features

- **Pine Script Parser** — Paste your strategy code and QuantumLab automatically extracts all `input.int`, `input.float`, `input.bool`, `input.string`, and `input.time` declarations with their ranges and defaults. Date inputs are detected and excluded from optimization.

- **Multi-Ticker, Multi-Timeframe** — Run optimizations across multiple trading pairs (SOL, BTC, ETH, HYPE, XRP, SUI, and more) and timeframes (5m through 12h) in a single sweep.

- **Two Run Modes** — Smoke Test (quick validation with reduced samples on a single ticker/timeframe) and Full Sweep (exhaustive optimization across all selected combinations).

- **Random Search + Refinement** — The optimizer uses random sampling to explore the parameter space, then refines the top performers with neighbourhood search to find optimal configurations.

- **Real-Time Progress** — A visual segmented progress bar shows optimization progress in real-time via Server-Sent Events, with ETA, elapsed time, and best-so-far metrics updating live.

- **Results Dashboard** — View ranked configurations with net profit, win rate, max drawdown, profit factor, and total trades. Drill into any config to see the full equity curve, individual trade log, and parameter values.

- **Risk Management Panel** — For each result, get leverage recommendations, Kelly criterion sizing, risk of ruin calculations, losing streak analysis, and deployment recommendations based on a $1,000 fixed trade size model.

- **Strategy Library** — Save strategies with their parsed inputs for quick reuse. Each strategy tracks its optimization run history.

- **Run History** — Browse all past optimization runs with status indicators. View saved results from any completed run or delete old runs.

- **CSV Export** — Download optimization results as CSV for further analysis.

- **Agent-Friendly API** — Machine-readable documentation at `/api/docs`, JSON polling endpoint at `/api/job/:id/status` for programmatic access. Designed for integration with AI agents and the QuantumVault platform.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui, Recharts, TanStack Query
- **Backend**: Express.js (TypeScript)
- **Database**: PostgreSQL with Drizzle ORM
- **Data Source**: Gate.io REST API (no API key required)
- **Real-Time**: Server-Sent Events for progress streaming

## Architecture

```
client/                  React frontend (Vite)
  src/pages/             Setup, Running, Results, Strategies, RunHistory, HistoryResults
  src/components/        Sidebar, RiskManagementPanel, shadcn UI components
  src/lib/               Risk analysis calculations, query client config

server/                  Express backend
  routes.ts              API endpoints (strategies CRUD, optimization, progress, results)
  pine-parser.ts         Pine Script input declaration extractor
  engine.ts              Bar-by-bar backtesting engine
  indicators.ts          Technical indicators (SMA, EMA, Hull MA, BB, KC, RSI, ADX, ATR, etc.)
  optimizer.ts           Random search + refinement optimization engine
  datafeed.ts            Gate.io OHLCV data fetcher with disk caching
  storage.ts             PostgreSQL + in-memory job state management
  schema.ts              Drizzle ORM table definitions

shared/
  schema.ts              TypeScript interfaces and Zod validation schemas
```

## Supported Indicators

The backtesting engine implements the following technical indicators from scratch:

- Simple, Exponential, Weighted, and Hull Moving Averages
- Bollinger Bands and Keltner Channels
- Squeeze Momentum (BB inside KC detection)
- RSI, ADX, ATR
- Linear Regression
- Volume analysis

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/docs` | Machine-readable API documentation |
| `GET` | `/api/tickers` | List supported trading pairs |
| `GET` | `/api/timeframes` | List supported timeframes |
| `POST` | `/api/parse-pine` | Parse Pine Script, extract parameters |
| `POST` | `/api/run-optimization` | Start an optimization job |
| `GET` | `/api/job/:id/status` | Poll job progress (JSON) |
| `GET` | `/api/job/:id/progress` | Stream job progress (SSE) |
| `GET` | `/api/job/:id/results` | Get optimization results |
| `POST` | `/api/job/:id/cancel` | Cancel a running job |
| `GET` | `/api/strategies` | List saved strategies |
| `POST` | `/api/strategies` | Save a strategy |
| `GET` | `/api/runs` | List optimization runs |
| `DELETE` | `/api/runs/:id` | Delete a run |
| `GET` | `/api/export/csv/:id` | Download results as CSV |

## Programmatic Usage

For agents or scripts, the recommended workflow is:

```
1. POST /api/parse-pine        → Extract parameters from Pine Script
2. POST /api/strategies         → Save the strategy (optional)
3. POST /api/run-optimization   → Start optimization, get jobId
4. GET  /api/job/:id/status     → Poll every 3-5s until status is "complete"
5. GET  /api/job/:id/results    → Retrieve ranked results with trades and equity curves
```

Full API documentation is available at the `/api/docs` endpoint.

## Data Constraints

- **Gate.io** serves approximately 9,500 historical candles per timeframe. For shorter timeframes, this means less historical depth (e.g., ~13 months of 1h data, ~6.5 months of 30m data).
- If a requested date range exceeds what Gate.io can provide, the app automatically adjusts the start date to the earliest available data and logs a notice.
- OHLCV data is cached to disk after the first fetch to avoid redundant API calls.

## Future Plans

- Integration into the QuantumVault platform with per-user data isolation
- API key authentication for programmatic access
- QV token-gating for premium optimization features
