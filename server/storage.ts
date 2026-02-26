import type { BacktestResult, JobProgress, OptimizationConfig, OptimizationResult } from "@shared/schema";
import { randomUUID } from "crypto";

export interface Job {
  id: string;
  config: OptimizationConfig;
  progress: JobProgress;
  results: BacktestResult[];
  abortSignal: { aborted: boolean };
  listeners: Set<(progress: JobProgress) => void>;
}

export interface IStorage {
  createJob(config: OptimizationConfig): Job;
  getJob(id: string): Job | undefined;
  updateProgress(id: string, progress: JobProgress): void;
  setResults(id: string, results: BacktestResult[]): void;
  getResults(id: string): OptimizationResult | undefined;
  cancelJob(id: string): void;
}

export class MemStorage implements IStorage {
  private jobs: Map<string, Job>;

  constructor() {
    this.jobs = new Map();
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

  getResults(id: string): OptimizationResult | undefined {
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

export const storage = new MemStorage();
