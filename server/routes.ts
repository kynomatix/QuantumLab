import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { parsePineScript } from "./pine-parser";
import { runOptimization } from "./optimizer";
import { optimizationConfigSchema, insertStrategyBodySchema, updateStrategyBodySchema, AVAILABLE_TICKERS } from "@shared/schema";
import { log } from "./index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/tickers", (_req: Request, res: Response) => {
    res.json(AVAILABLE_TICKERS);
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
