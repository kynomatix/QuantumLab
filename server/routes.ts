import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { parsePineScript } from "./pine-parser";
import { runOptimization } from "./optimizer";
import { optimizationConfigSchema, insertStrategyBodySchema, updateStrategyBodySchema, AVAILABLE_TICKERS, AVAILABLE_TIMEFRAMES } from "@shared/schema";
import { log } from "./index";

const API_DOCS = {
  name: "QuantumLab API",
  version: "1.0.0",
  description: "Pine Script strategy backtester and optimizer for crypto futures. Companion service to myquantumvault.com.",
  baseUrl: "/api",
  endpoints: [
    {
      method: "GET", path: "/api/tickers",
      description: "List all supported trading pairs",
      response: "Array of { symbol, name }",
    },
    {
      method: "GET", path: "/api/timeframes",
      description: "List all supported timeframes",
      response: "Array of strings (e.g. '1h', '4h')",
    },
    {
      method: "POST", path: "/api/parse-pine",
      description: "Parse Pine Script code and extract optimizable input parameters",
      body: "{ code: string }",
      response: "{ inputs: PineInput[], groups: Record<string, string>, strategySettings: {...} }",
    },
    {
      method: "GET", path: "/api/strategies",
      description: "List all saved strategies",
      response: "Array of Strategy objects",
    },
    {
      method: "GET", path: "/api/strategies/:id",
      description: "Get a specific strategy by ID",
      response: "Strategy object with parsedInputs, pineScript, etc.",
    },
    {
      method: "POST", path: "/api/strategies",
      description: "Save a new strategy",
      body: "{ name: string, pineScript: string, parsedInputs: PineInput[], groups?: object, strategySettings?: object }",
      response: "Created Strategy object",
    },
    {
      method: "PATCH", path: "/api/strategies/:id",
      description: "Update an existing strategy",
      body: "Partial strategy fields",
      response: "Updated Strategy object",
    },
    {
      method: "DELETE", path: "/api/strategies/:id",
      description: "Delete a strategy",
      response: "{ success: true }",
    },
    {
      method: "POST", path: "/api/run-optimization",
      description: "Start an optimization job. Returns immediately with jobId to poll for progress.",
      body: "{ pineScript, parsedInputs, tickers: string[], timeframes: string[], startDate, endDate, randomSamples?: 900, topK?: 20, refinementsPerSeed?: 60, minTrades?: 10, maxDrawdownCap?: 85, mode: 'smoke'|'sweep', strategyId?: number }",
      response: "{ jobId: string, runId?: number }",
      notes: "Smoke test: uses first ticker/timeframe only, max 100 samples, 5 topK, 20 refinements. Full sweep: uses all tickers/timeframes with full settings.",
    },
    {
      method: "GET", path: "/api/job/:id/status",
      description: "Poll job status (agent-friendly alternative to SSE). Returns current progress as JSON.",
      response: "JobProgress object: { jobId, status, stage, current, total, percent, elapsed, eta, bestSoFar, tickerProgress }",
      notes: "Status values: fetching, baseline, random_search, refinement, complete, error. Poll every 2-5 seconds until status is 'complete' or 'error'.",
    },
    {
      method: "GET", path: "/api/job/:id/progress",
      description: "SSE stream of real-time progress updates (browser-friendly)",
      response: "Server-Sent Events stream of JobProgress objects",
      notes: "Each message is a JSON-encoded JobProgress. Connection includes 15s heartbeat.",
    },
    {
      method: "GET", path: "/api/job/:id/results",
      description: "Get final optimization results for a completed job",
      response: "{ jobId, runId, configs: BacktestResult[], totalConfigsTested, bestByCombo }",
    },
    {
      method: "POST", path: "/api/job/:id/cancel",
      description: "Cancel a running optimization job",
      response: "{ success: true }",
    },
    {
      method: "GET", path: "/api/runs",
      description: "List all historical optimization runs. Optional ?strategyId= filter.",
      response: "Array of OptimizationRun objects",
    },
    {
      method: "GET", path: "/api/runs/:id",
      description: "Get details for a specific historical run",
      response: "OptimizationRun object",
    },
    {
      method: "GET", path: "/api/runs/:id/results",
      description: "Get saved results for a historical run",
      response: "Array of OptResult objects with params, trades, equityCurve",
    },
    {
      method: "GET", path: "/api/runs/:id/job",
      description: "Find the active in-memory job for a running DB run",
      response: "{ jobId: string }",
    },
    {
      method: "GET", path: "/api/export/csv/:id",
      description: "Download optimization results as CSV",
      response: "CSV file download",
    },
  ],
  agentWorkflow: {
    description: "Recommended workflow for programmatic/agent usage",
    steps: [
      "1. POST /api/parse-pine with your Pine Script code to extract parameters",
      "2. POST /api/strategies to save the strategy (optional but recommended)",
      "3. POST /api/run-optimization with parsed inputs, tickers, timeframes, dates, and mode",
      "4. Poll GET /api/job/:jobId/status every 3-5 seconds until status is 'complete' or 'error'",
      "5. GET /api/job/:jobId/results to retrieve the full optimization results",
      "6. Results include best parameter configs, trade logs, equity curves, and risk metrics per ticker/timeframe combo",
    ],
  },
  dataTypes: {
    PineInput: "{ name, type: 'int'|'float'|'bool'|'string'|'time', default, label, min?, max?, step?, group?, options?, optimizable }",
    BacktestResult: "{ ticker, timeframe, netProfitPercent, winRatePercent, maxDrawdownPercent, profitFactor, totalTrades, params, trades, equityCurve }",
    TradeRecord: "{ entryTime, exitTime, direction: 'long'|'short', entryPrice, exitPrice, pnlPercent, pnlDollar, exitReason, barsHeld }",
    JobProgress: "{ jobId, status, stage, current, total, percent, elapsed, eta?, bestSoFar?, tickerProgress?, error? }",
  },
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/docs", (_req: Request, res: Response) => {
    res.json(API_DOCS);
  });

  app.get("/api/tickers", (_req: Request, res: Response) => {
    res.json(AVAILABLE_TICKERS);
  });

  app.get("/api/timeframes", (_req: Request, res: Response) => {
    res.json(AVAILABLE_TIMEFRAMES);
  });

  app.post("/api/parse-pine", (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Pine Script code is required" });
      }
      const result = parsePineScript(code);
      res.json(result);
    } catch (err: any) {
      log(`Parse error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/strategies", async (_req: Request, res: Response) => {
    try {
      const list = await storage.getStrategies();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/strategies/:id", async (req: Request, res: Response) => {
    try {
      const strategy = await storage.getStrategy(parseInt(req.params.id));
      if (!strategy) return res.status(404).json({ error: "Strategy not found" });
      res.json(strategy);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/strategies", async (req: Request, res: Response) => {
    try {
      const parsed = insertStrategyBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const strategy = await storage.createStrategy(parsed.data);
      res.json(strategy);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/strategies/:id", async (req: Request, res: Response) => {
    try {
      const parsed = updateStrategyBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const strategy = await storage.updateStrategy(parseInt(req.params.id), parsed.data);
      if (!strategy) return res.status(404).json({ error: "Strategy not found" });
      res.json(strategy);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/strategies/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteStrategy(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/runs", async (req: Request, res: Response) => {
    try {
      const strategyId = req.query.strategyId ? parseInt(req.query.strategyId as string) : undefined;
      const runs = await storage.getRuns(strategyId);
      res.json(runs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/runs/:id", async (req: Request, res: Response) => {
    try {
      const run = await storage.getRun(parseInt(req.params.id));
      if (!run) return res.status(404).json({ error: "Run not found" });
      res.json(run);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/runs/:id/job", (req: Request, res: Response) => {
    const runId = parseInt(req.params.id);
    const job = storage.getJobByRunId(runId);
    if (!job) return res.status(404).json({ error: "No active job for this run" });
    res.json({ jobId: job.id });
  });

  app.get("/api/runs/:id/results", async (req: Request, res: Response) => {
    try {
      const results = await storage.getRunResults(parseInt(req.params.id));
      if (!results.length) return res.status(404).json({ error: "No results found" });
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/runs/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteRun(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/run-optimization", async (req: Request, res: Response) => {
    try {
      const parsed = optimizationConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const config = parsed.data;
      const job = storage.createJob(config);

      let runId: number | undefined;
      if (config.strategyId) {
        const run = await storage.createRun({
          strategyId: config.strategyId,
          tickers: config.tickers,
          timeframes: config.timeframes,
          startDate: config.startDate,
          endDate: config.endDate,
          randomSamples: config.randomSamples,
          topK: config.topK,
          refinementsPerSeed: config.refinementsPerSeed,
          minTrades: config.minTrades,
          maxDrawdownCap: config.maxDrawdownCap,
          mode: config.mode,
          status: "running",
        });
        runId = run.id;
        job.runId = runId;
      }

      runOptimization(
        config,
        (progress) => storage.updateProgress(job.id, progress),
        job.id,
        job.abortSignal
      ).then(async (results) => {
        log(`Optimization finished: ${results.length} results`);
        storage.setResults(job.id, results);
        if (runId) {
          try {
            await storage.saveResults(runId, results);
            const totalSamples = config.randomSamples + config.topK * config.refinementsPerSeed;
            const combos = config.tickers.length * config.timeframes.length;
            await storage.completeRun(runId, totalSamples * combos);
            log(`Run ${runId} saved and completed`);
          } catch (err: any) {
            log(`Failed to save results to DB: ${err.stack || err.message}`);
          }
        }
      }).catch(async (err) => {
        log(`Optimization error: ${err.stack || err.message}`);
        storage.updateProgress(job.id, {
          jobId: job.id,
          status: "error",
          stage: `Error: ${err.message}`,
          current: 0,
          total: 0,
          percent: 0,
          elapsed: 0,
          error: err.message,
        });
        if (runId) {
          try { await storage.failRun(runId); } catch {}
        }
      });

      res.json({ jobId: job.id, runId });
    } catch (err: any) {
      log(`Run error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/job/:id/status", (req: Request, res: Response) => {
    const job = storage.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(job.progress);
  });

  app.get("/api/job/:id/progress", (req: Request, res: Response) => {
    const job = storage.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    if (typeof (res as any).flushHeaders === "function") {
      (res as any).flushHeaders();
    }

    const sendProgress = (progress: any) => {
      try {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      } catch {}
    };

    sendProgress(job.progress);

    const heartbeat = setInterval(() => {
      try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
    }, 15000);

    job.listeners.add(sendProgress);

    req.on("close", () => {
      clearInterval(heartbeat);
      job.listeners.delete(sendProgress);
    });
  });

  app.get("/api/job/:id/results", (req: Request, res: Response) => {
    const results = storage.getJobResult(req.params.id);
    if (!results) {
      return res.status(404).json({ error: "Results not found" });
    }
    res.json(results);
  });

  app.post("/api/job/:id/cancel", (req: Request, res: Response) => {
    storage.cancelJob(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/export/csv/:id", (req: Request, res: Response) => {
    const results = storage.getJobResult(req.params.id);
    if (!results) {
      return res.status(404).json({ error: "Results not found" });
    }

    const headers = ["Rank", "Ticker", "Timeframe", "Net Profit %", "Win Rate %", "Max Drawdown %", "Profit Factor", "Total Trades", "Parameters"];
    const rows = results.configs.map((config, idx) => [
      idx + 1,
      config.ticker,
      config.timeframe,
      config.netProfitPercent,
      config.winRatePercent,
      config.maxDrawdownPercent,
      config.profitFactor,
      config.totalTrades,
      JSON.stringify(config.params),
    ]);

    const csv = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="optimization_results_${req.params.id}.csv"`);
    res.send(csv);
  });

  return httpServer;
}
