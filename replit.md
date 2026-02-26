# Flux Momentum Backtester & Optimizer

## Overview
Web application for backtesting and optimizing Pine Script trading strategies against Binance USD-M futures OHLCV data. Dark-themed trading terminal aesthetic.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS (dark theme), Monaco Editor, Recharts
- **Backend**: Express.js (TypeScript)
- **Data**: ccxt library for Binance USD-M Futures public OHLCV data (no API key needed)
- **Storage**: In-memory for job state, file system cache for OHLCV data

## Key Features
1. Pine Script parser extracts input.int/float/bool/string/time declarations
2. Date inputs are automatically detected and marked as non-optimizable
3. Multi-ticker, multi-timeframe backtesting with parameter optimization
4. Random search + neighbourhood refinement optimization
5. Real-time progress via SSE (Server-Sent Events)
6. Results dashboard with equity curves, trade logs, config tables
7. CSV export

## File Structure
### Frontend
- `client/src/App.tsx` - Main app with routing and header
- `client/src/pages/Setup.tsx` - Pine Script editor, ticker/TF/date selection, parsed params display
- `client/src/pages/Running.tsx` - Real-time optimization progress dashboard
- `client/src/pages/Results.tsx` - Results dashboard with summary cards, config table, equity curve, trade log

### Backend
- `server/routes.ts` - API endpoints (parse, run, progress SSE, results, export)
- `server/pine-parser.ts` - Pine Script input declaration parser
- `server/engine.ts` - Bar-by-bar backtesting engine with squeeze momentum strategy
- `server/indicators.ts` - Technical indicators (SMA, EMA, WMA, Hull MA, BB, KC, RSI, ADX, ATR, LinReg, Volume, Squeeze)
- `server/optimizer.ts` - Random search + refinement optimization engine
- `server/datafeed.ts` - ccxt OHLCV data fetcher with disk caching
- `server/storage.ts` - In-memory job state management

### Shared
- `shared/schema.ts` - TypeScript types, Zod schemas, constants (tickers, timeframes)

## API Endpoints
- `GET /api/tickers` - List available tickers
- `POST /api/parse-pine` - Parse Pine Script, return extracted parameters
- `POST /api/run-optimization` - Start optimization job (returns jobId)
- `GET /api/job/:id/progress` - SSE stream of progress updates
- `GET /api/job/:id/results` - Get final optimization results
- `POST /api/job/:id/cancel` - Cancel running job
- `GET /api/export/csv/:id` - Download results as CSV

## Theme
Dark trading terminal aesthetic with:
- Background: very dark blue-gray
- Accent: blue (#2196f3)
- Profit: teal green (#26a69a)
- Loss: red (#ef5350)
- Warning: orange (#ff9800)
- Font: Inter (UI) + JetBrains Mono (code/data)

## Important Design Decision
Date range inputs in Pine Script strategies are automatically detected and excluded from the optimization parameter space. The date range is set via the UI date pickers and is treated as a fixed configuration, never modified by the optimizer.
