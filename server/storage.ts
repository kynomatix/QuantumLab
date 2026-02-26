import {
  strategies, optimizationRuns, optimizationResults,
  type Strategy, type InsertStrategy,
  type OptimizationRun, type InsertRun,
  type OptResult, type InsertResult,
} from "./schema";
import type { BacktestResult, JobProgress, OptimizationConfig, JobResult } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface Job {
  id: string;
  config: OptimizationConfig;
  progress: JobProgress;
  results: BacktestResult[];
  abortSignal: { aborted: boolean };
  listeners: Set<(progress: JobProgress) => void>;
  runId?: number;
}

export interface IStorage {
  createStrategy(data: InsertStrategy): Promise<Strategy>;
  getStrategies(): Promise<Strategy[]>;
  getStrategy(id: number): Promise<Strategy | undefined>;
  updateStrategy(id: number, data: Partial<InsertStrategy>): Promise<Strategy | undefined>;
  deleteStrategy(id: number): Promise<void>;

  createRun(data: InsertRun): Promise<OptimizationRun>;
  getRuns(strategyId?: number): Promise<OptimizationRun[]>;
  getRun(id: number): Promise<OptimizationRun | undefined>;
  completeRun(id: number, totalConfigsTested: number): Promise<void>;
  failRun(id: number): Promise<void>;

  saveResults(runId: number, results: BacktestResult[]): Promise<void>;
  getRunResults(runId: number): Promise<OptResult[]>;

  createJob(config: OptimizationConfig): Job;
  getJob(id: string): Job | undefined;
  updateProgress(id: string, progress: JobProgress): void;
  setResults(id: string, results: BacktestResult[]): void;
  getJobResult(id: string): JobResult | undefined;
  cancelJob(id: string): void;
}

export class DatabaseStorage implements IStorage {
  private jobs: Map<string, Job>;

  constructor() {
    this.jobs = new Map();
  }

  async createStrategy(data: InsertStrategy): Promise<Strategy> {
    const [strategy] = await db.insert(strategies).values(data).returning();
    return strategy;
  }

  async getStrategies(): Promise<Strategy[]> {
    return db.select().from(strategies).orderBy(desc(strategies.createdAt));
  }

  async getStrategy(id: number): Promise<Strategy | undefined> {
    const [strategy] = await db.select().from(strategies).where(eq(strategies.id, id));
    return strategy;
  }

  async updateStrategy(id: number, data: Partial<InsertStrategy>): Promise<Strategy | undefined> {
    const [strategy] = await db.update(strategies).set(data).where(eq(strategies.id, id)).returning();
    return strategy;
  }

  async deleteStrategy(id: number): Promise<void> {
    await db.delete(strategies).where(eq(strategies.id, id));
  }

  async createRun(data: InsertRun): Promise<OptimizationRun> {
    const [run] = await db.insert(optimizationRuns).values(data).returning();
    return run;
  }

  async getRuns(strategyId?: number): Promise<OptimizationRun[]> {
    if (strategyId) {
      return db.select().from(optimizationRuns).where(eq(optimizationRuns.strategyId, strategyId)).orderBy(desc(optimizationRuns.createdAt));
    }
    return db.select().from(optimizationRuns).orderBy(desc(optimizationRuns.createdAt));
  }

  async getRun(id: number): Promise<OptimizationRun | undefined> {
    const [run] = await db.select().from(optimizationRuns).where(eq(optimizationRuns.id, id));
    return run;
  }

  async completeRun(id: number, totalConfigsTested: number): Promise<void> {
    await db.update(optimizationRuns).set({
      status: "complete",
      totalConfigsTested,
      completedAt: new Date(),
    }).where(eq(optimizationRuns.id, id));
  }

  async failRun(id: number): Promise<void> {
    await db.update(optimizationRuns).set({
      status: "failed",
      completedAt: new Date(),
    }).where(eq(optimizationRuns.id, id));
  }

  async saveResults(runId: number, results: BacktestResult[]): Promise<void> {
    if (results.length === 0) return;
    const insertData: InsertResult[] = results.map((r, idx) => ({
      runId,
      ticker: r.ticker,
      timeframe: r.timeframe,
      rank: idx + 1,
      netProfitPercent: r.netProfitPercent,
      winRatePercent: r.winRatePercent,
      maxDrawdownPercent: r.maxDrawdownPercent,
      profitFactor: r.profitFactor,
      totalTrades: r.totalTrades,
      params: r.params,
      trades: r.trades,
      equityCurve: r.equityCurve,
    }));

    const batchSize = 50;
    for (let i = 0; i < insertData.length; i += batchSize) {
      await db.insert(optimizationResults).values(insertData.slice(i, i + batchSize));
    }
  }

  async getRunResults(runId: number): Promise<OptResult[]> {
    return db.select().from(optimizationResults).where(eq(optimizationResults.runId, runId)).orderBy(optimizationResults.rank);
  }

  createJob(config: OptimizationConfig): Job {
    const id = randomUUID();
    const job: Job = {
      id,
      config,
      progress: {
        jobId: id,
        status: "fetching",
        stage: "Initializing...",
        current: 0,
        total: 0,
        percent: 0,
        elapsed: 0,
      },
      results: [],
      abortSignal: { aborted: false },
      listeners: new Set(),
    };
    this.jobs.set(id, job);
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  updateProgress(id: string, progress: JobProgress): void {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = progress;
      for (const listener of job.listeners) {
        try { listener(progress); } catch {}
      }
    }
  }

  setResults(id: string, results: BacktestResult[]): void {
    const job = this.jobs.get(id);
    if (job) {
      job.results = results;
    }
  }

  getJobResult(id: string): JobResult | undefined {
    const job = this.jobs.get(id);
    if (!job || job.results.length === 0) return undefined;

    const bestByCombo: Record<string, BacktestResult[]> = {};
    for (const result of job.results) {
      const key = `${result.ticker}|${result.timeframe}`;
      if (!bestByCombo[key]) bestByCombo[key] = [];
      bestByCombo[key].push(result);
    }

    const totalSamples = job.config.randomSamples + job.config.topK * job.config.refinementsPerSeed;
    const combos = job.config.tickers.length * job.config.timeframes.length;

    return {
      jobId: id,
      runId: job.runId,
      configs: job.results,
      totalConfigsTested: totalSamples * combos,
      bestByCombo,
    };
  }

  cancelJob(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.abortSignal.aborted = true;
    }
  }
}

export const storage = new DatabaseStorage();
