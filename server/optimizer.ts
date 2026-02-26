import type { PineInput, BacktestResult, OptimizationConfig, JobProgress } from "@shared/schema";
import { runBacktest } from "./engine";
import { fetchOHLCV } from "./datafeed";
import { log } from "./index";

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function generateRandomParams(inputs: PineInput[]): Record<string, any> {
  const params: Record<string, any> = {};
  for (const input of inputs) {
    if (!input.optimizable) {
      params[input.name] = input.default;
      continue;
    }
    switch (input.type) {
      case "int": {
        const min = input.min ?? 1;
        const max = input.max ?? 100;
        const step = input.step ?? 1;
        const range = Math.floor((max - min) / step);
        params[input.name] = min + Math.floor(Math.random() * (range + 1)) * step;
        break;
      }
      case "float": {
        const min = input.min ?? 0.1;
        const max = input.max ?? 10;
        const step = input.step ?? 0.1;
        const range = Math.floor((max - min) / step);
        const val = min + Math.floor(Math.random() * (range + 1)) * step;
        params[input.name] = Math.round(val * 10000) / 10000;
        break;
      }
      case "bool":
        params[input.name] = Math.random() > 0.5;
        break;
      case "string":
        if (input.options && input.options.length > 0) {
          params[input.name] = input.options[Math.floor(Math.random() * input.options.length)];
        } else {
          params[input.name] = input.default;
        }
        break;
      default:
        params[input.name] = input.default;
    }
  }
  return params;
}

function jitterParams(baseParams: Record<string, any>, inputs: PineInput[], jitterCount: number = 4): Record<string, any> {
  const params = { ...baseParams };
  const optimizable = inputs.filter(i => i.optimizable && (i.type === "int" || i.type === "float"));
  const toJitter = optimizable.sort(() => Math.random() - 0.5).slice(0, jitterCount);

  for (const input of toJitter) {
    const min = input.min ?? 0;
    const max = input.max ?? 100;
    const range = max - min;
    const jitterAmount = range * 0.15;

    if (input.type === "int") {
      const step = input.step ?? 1;
      const currentVal = params[input.name] ?? input.default;
      const newVal = currentVal + (Math.random() - 0.5) * 2 * jitterAmount;
      params[input.name] = Math.max(min, Math.min(max, Math.round(newVal / step) * step));
    } else {
      const step = input.step ?? 0.1;
      const currentVal = params[input.name] ?? input.default;
      const newVal = currentVal + (Math.random() - 0.5) * 2 * jitterAmount;
      params[input.name] = Math.max(min, Math.min(max, Math.round(newVal / step) * step));
      params[input.name] = Math.round(params[input.name] * 10000) / 10000;
    }
  }

  const boolInputs = inputs.filter(i => i.optimizable && i.type === "bool");
  if (boolInputs.length > 0 && Math.random() < 0.2) {
    const toBool = boolInputs[Math.floor(Math.random() * boolInputs.length)];
    params[toBool.name] = !params[toBool.name];
  }

  return params;
}

function scoreResult(r: BacktestResult): number {
  return r.netProfitPercent * 1000 + r.winRatePercent * 10 - r.maxDrawdownPercent * 5;
}

export async function runOptimization(
  config: OptimizationConfig,
  onProgress: (progress: JobProgress) => void,
  jobId: string,
  abortSignal?: { aborted: boolean }
): Promise<BacktestResult[]> {
  const startTime = Date.now();
  const allResults: BacktestResult[] = [];
  const inputs = config.parsedInputs;

  const combos: { ticker: string; timeframe: string }[] = [];
  for (const ticker of config.tickers) {
    for (const tf of config.timeframes) {
      combos.push({ ticker, timeframe: tf });
    }
  }

  const tickerProgress: Record<string, { status: "pending" | "running" | "complete"; best?: number }> = {};
  for (const combo of combos) {
    tickerProgress[`${combo.ticker}|${combo.timeframe}`] = { status: "pending" };
  }

  const totalSamples = config.randomSamples + config.topK * config.refinementsPerSeed;
  let globalCurrent = 0;

  for (const combo of combos) {
    if (abortSignal?.aborted) break;
    const key = `${combo.ticker}|${combo.timeframe}`;
    tickerProgress[key] = { status: "running" };

    onProgress({
      jobId,
      status: "fetching",
      stage: `Fetching data for ${combo.ticker.split("/")[0]} ${combo.timeframe}`,
      current: globalCurrent,
      total: totalSamples * combos.length,
      percent: Math.round((globalCurrent / (totalSamples * combos.length)) * 100),
      elapsed: Date.now() - startTime,
      tickerProgress,
    });

    let candles: OHLCV[];
    try {
      candles = await fetchOHLCV(
        combo.ticker,
        combo.timeframe,
        config.startDate,
        config.endDate,
        (msg) => onProgress({
          jobId,
          status: "fetching",
          stage: msg,
          current: globalCurrent,
          total: totalSamples * combos.length,
          percent: Math.round((globalCurrent / (totalSamples * combos.length)) * 100),
          elapsed: Date.now() - startTime,
          tickerProgress,
        })
      );
    } catch (err: any) {
      log(`Failed to fetch data for ${combo.ticker}: ${err.message}`);
      tickerProgress[key] = { status: "complete", best: 0 };
      continue;
    }

    if (candles.length < 100) {
      log(`Not enough candles for ${combo.ticker} ${combo.timeframe}: ${candles.length}`);
      tickerProgress[key] = { status: "complete", best: 0 };
      continue;
    }

    const defaultParams: Record<string, any> = {};
    for (const input of inputs) {
      defaultParams[input.name] = input.default;
    }

    const baseline = runBacktest(candles, defaultParams, combo.ticker, combo.timeframe);
    let comboResults: BacktestResult[] = [baseline];

    onProgress({
      jobId,
      status: "random_search",
      stage: `Random Search — ${combo.ticker.split("/")[0]} ${combo.timeframe} — 0/${config.randomSamples}`,
      current: globalCurrent,
      total: totalSamples * combos.length,
      percent: Math.round((globalCurrent / (totalSamples * combos.length)) * 100),
      elapsed: Date.now() - startTime,
      bestSoFar: {
        netProfitPercent: baseline.netProfitPercent,
        winRatePercent: baseline.winRatePercent,
        maxDrawdownPercent: baseline.maxDrawdownPercent,
        profitFactor: baseline.profitFactor,
      },
      tickerProgress,
    });

    for (let s = 0; s < config.randomSamples; s++) {
      if (abortSignal?.aborted) break;
      const params = generateRandomParams(inputs);
      const result = runBacktest(candles, params, combo.ticker, combo.timeframe);
      if (result.totalTrades >= config.minTrades && result.maxDrawdownPercent <= config.maxDrawdownCap) {
        comboResults.push(result);
      }
      globalCurrent++;

      if (s % 50 === 0) {
        const best = comboResults.sort((a, b) => scoreResult(b) - scoreResult(a))[0];
        onProgress({
          jobId,
          status: "random_search",
          stage: `Random Search — ${combo.ticker.split("/")[0]} ${combo.timeframe} — ${s}/${config.randomSamples}`,
          current: globalCurrent,
          total: totalSamples * combos.length,
          percent: Math.round((globalCurrent / (totalSamples * combos.length)) * 100),
          elapsed: Date.now() - startTime,
          bestSoFar: {
            netProfitPercent: best.netProfitPercent,
            winRatePercent: best.winRatePercent,
            maxDrawdownPercent: best.maxDrawdownPercent,
            profitFactor: best.profitFactor,
          },
          tickerProgress,
          eta: estimateEta(startTime, globalCurrent, totalSamples * combos.length),
        });
      }
    }

    comboResults.sort((a, b) => scoreResult(b) - scoreResult(a));
    const topSeeds = comboResults.slice(0, config.topK);

    onProgress({
      jobId,
      status: "refinement",
      stage: `Refining top ${topSeeds.length} seeds — ${combo.ticker.split("/")[0]} ${combo.timeframe}`,
      current: globalCurrent,
      total: totalSamples * combos.length,
      percent: Math.round((globalCurrent / (totalSamples * combos.length)) * 100),
      elapsed: Date.now() - startTime,
      tickerProgress,
    });

    for (let seedIdx = 0; seedIdx < topSeeds.length; seedIdx++) {
      if (abortSignal?.aborted) break;
      const seed = topSeeds[seedIdx];
      for (let r = 0; r < config.refinementsPerSeed; r++) {
        if (abortSignal?.aborted) break;
        const jitteredParams = jitterParams(seed.params, inputs);
        const result = runBacktest(candles, jitteredParams, combo.ticker, combo.timeframe);
        if (result.totalTrades >= config.minTrades && result.maxDrawdownPercent <= config.maxDrawdownCap) {
          comboResults.push(result);
        }
        globalCurrent++;
      }

      if (seedIdx % 5 === 0) {
        const best = comboResults.sort((a, b) => scoreResult(b) - scoreResult(a))[0];
        onProgress({
          jobId,
          status: "refinement",
          stage: `Refining seed ${seedIdx + 1}/${topSeeds.length} — ${combo.ticker.split("/")[0]} ${combo.timeframe}`,
          current: globalCurrent,
          total: totalSamples * combos.length,
          percent: Math.round((globalCurrent / (totalSamples * combos.length)) * 100),
          elapsed: Date.now() - startTime,
          bestSoFar: {
            netProfitPercent: best.netProfitPercent,
            winRatePercent: best.winRatePercent,
            maxDrawdownPercent: best.maxDrawdownPercent,
            profitFactor: best.profitFactor,
          },
          tickerProgress,
          eta: estimateEta(startTime, globalCurrent, totalSamples * combos.length),
        });
      }
    }

    comboResults.sort((a, b) => scoreResult(b) - scoreResult(a));
    const topForCombo = comboResults.slice(0, 10);
    allResults.push(...topForCombo);

    tickerProgress[key] = {
      status: "complete",
      best: topForCombo[0]?.netProfitPercent ?? 0,
    };
  }

  allResults.sort((a, b) => scoreResult(b) - scoreResult(a));

  onProgress({
    jobId,
    status: "complete",
    stage: "Optimization complete",
    current: totalSamples * combos.length,
    total: totalSamples * combos.length,
    percent: 100,
    elapsed: Date.now() - startTime,
    bestSoFar: allResults[0] ? {
      netProfitPercent: allResults[0].netProfitPercent,
      winRatePercent: allResults[0].winRatePercent,
      maxDrawdownPercent: allResults[0].maxDrawdownPercent,
      profitFactor: allResults[0].profitFactor,
    } : undefined,
    tickerProgress,
  });

  return allResults;
}

function estimateEta(startTime: number, current: number, total: number): number {
  if (current === 0) return 0;
  const elapsed = Date.now() - startTime;
  const rate = current / elapsed;
  return Math.round((total - current) / rate);
}
