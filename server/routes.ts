import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { parsePineScript } from "./pine-parser";
import { runOptimization } from "./optimizer";
import { optimizationConfigSchema, AVAILABLE_TICKERS } from "@shared/schema";
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

  app.post("/api/run-optimization", (req: Request, res: Response) => {
    try {
      const parsed = optimizationConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }

      const config = parsed.data;
      const job = storage.createJob(config);

      runOptimization(
        config,
        (progress) => storage.updateProgress(job.id, progress),
        job.id,
        job.abortSignal
      ).then((results) => {
        storage.setResults(job.id, results);
      }).catch((err) => {
        log(`Optimization error: ${err.message}`);
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
      });

      res.json({ jobId: job.id });
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
    const results = storage.getResults(req.params.id);
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
    const results = storage.getResults(req.params.id);
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
