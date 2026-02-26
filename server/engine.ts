import type { TradeRecord, BacktestResult, PineInput } from "@shared/schema";
import * as ind from "./indicators";

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EngineConfig {
  initialCapital: number;
  commission: number;
  positionSize: number;
}

function getParam(params: Record<string, any>, name: string, defaultVal: any): any {
  return params[name] !== undefined ? params[name] : defaultVal;
}

export function runBacktest(
  candles: OHLCV[],
  params: Record<string, any>,
  ticker: string,
  timeframe: string,
  config: EngineConfig = { initialCapital: 100, commission: 0.0005, positionSize: 1000 }
): BacktestResult {
  const close = candles.map(c => c.close);
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const volume = candles.map(c => c.volume);
  const n = candles.length;

  const bbLen = getParam(params, "bbLen", 20);
  const bbMult = getParam(params, "bbMult", 2.0);
  const kcLen = getParam(params, "kcLen", 20);
  const kcMult = getParam(params, "kcMult", 1.5);
  const momLen = getParam(params, "momLen", 12);
  const hullLen = getParam(params, "hullLen", 55);
  const useHull = getParam(params, "useHullFilter", true);
  const adxLen = getParam(params, "adxLen", 14);
  const adxThresh = getParam(params, "adxThresh", 20);
  const useAdx = getParam(params, "useADXFilter", true);
  const rsiLen = getParam(params, "rsiLen", 14);
  const rsiOBLevel = getParam(params, "rsiOB", 70);
  const rsiOSLevel = getParam(params, "rsiOS", 30);
  const useRsi = getParam(params, "useRSIFilter", true);
  const volLen = getParam(params, "volLen", 20);
  const volMult = getParam(params, "volMult", 1.0);
  const useVol = getParam(params, "useVolFilter", false);
  const atrLen = getParam(params, "atrLen", 14);
  const slMult = getParam(params, "slMult", 2.0);
  const tp1Mult = getParam(params, "tp1Mult", 1.5);
  const tp2Mult = getParam(params, "tp2Mult", 3.0);
  const tp3Mult = getParam(params, "tp3Mult", 5.0);
  const tp1Pct = getParam(params, "tp1Pct", 30);
  const tp2Pct = getParam(params, "tp2Pct", 30);
  const useTrailing = getParam(params, "useTrailing", true);
  const trailMult = getParam(params, "trailMult", 1.0);
  const tradeDir = getParam(params, "tradeDir", "Both");

  const bb = ind.bollingerBands(close, bbLen, bbMult);
  const kc = ind.keltnerChannel(close, high, low, kcLen, kcLen, kcMult);
  const sqz = ind.squeeze(bb.upper, bb.lower, kc.upper, kc.lower);
  const mom = ind.linreg(close.map((c, i) => c - ind.sma(close, bbLen)[i]).map(v => isNaN(v) ? 0 : v), momLen);
  const hull = useHull ? ind.hullMa(close, hullLen) : null;
  const adxVals = useAdx ? ind.adx(high, low, close, adxLen) : null;
  const rsiVals = useRsi ? ind.rsi(close, rsiLen) : null;
  const volSma = useVol ? ind.volumeSma(volume, volLen) : null;
  const atrVals = ind.atr(high, low, close, atrLen);

  const trades: TradeRecord[] = [];
  const equityCurve: { time: string; equity: number }[] = [];
  let equity = config.initialCapital;
  let position: null | {
    direction: "long" | "short";
    entryPrice: number;
    entryBar: number;
    entryTime: string;
    size: number;
    remainingQty: number;
    stopLoss: number;
    tp1Hit: boolean;
    tp2Hit: boolean;
    trailStop: number;
    trailActive: boolean;
  } = null;

  const warmup = Math.max(bbLen, kcLen, hullLen, adxLen * 2, rsiLen, volLen, momLen) + 10;

  for (let i = 0; i < n; i++) {
    const time = new Date(candles[i].time).toISOString();

    if (i < warmup) {
      equityCurve.push({ time, equity });
      continue;
    }

    if (position) {
      const dir = position.direction;
      const entry = position.entryPrice;
      const atrVal = isNaN(atrVals[i]) ? close[i] * 0.02 : atrVals[i];
      const sl = position.stopLoss;
      const tp1Price = dir === "long" ? entry + atrVal * tp1Mult : entry - atrVal * tp1Mult;
      const tp2Price = dir === "long" ? entry + atrVal * tp2Mult : entry - atrVal * tp2Mult;
      const tp3Price = dir === "long" ? entry + atrVal * tp3Mult : entry - atrVal * tp3Mult;

      let exitPrice: number | null = null;
      let exitReason = "";
      let qtyExited = 0;

      if (dir === "long") {
        if (low[i] <= sl) {
          exitPrice = sl;
          exitReason = position.trailActive ? "Trailing Stop" : "Stop Loss";
          qtyExited = position.remainingQty;
        } else if (!position.tp1Hit && high[i] >= tp1Price) {
          const partialQty = position.remainingQty * (tp1Pct / 100);
          const pnl = (tp1Price - entry) / entry;
          equity += partialQty * config.positionSize * pnl - 2 * partialQty * config.positionSize * config.commission;
          position.remainingQty -= partialQty;
          position.tp1Hit = true;
          position.stopLoss = entry + atrVal * 0.1;
          if (useTrailing) {
            position.trailActive = true;
            position.trailStop = close[i] - atrVal * trailMult;
          }
        }

        if (!exitPrice && position.tp1Hit && !position.tp2Hit && high[i] >= tp2Price) {
          const partialQty = position.remainingQty * (tp2Pct / (100 - tp1Pct)) * ((100 - tp1Pct) / 100);
          const effectiveQty = Math.min(partialQty, position.remainingQty * 0.5);
          const pnl = (tp2Price - entry) / entry;
          equity += effectiveQty * config.positionSize * pnl - 2 * effectiveQty * config.positionSize * config.commission;
          position.remainingQty -= effectiveQty;
          position.tp2Hit = true;
        }

        if (!exitPrice && position.tp2Hit && high[i] >= tp3Price) {
          exitPrice = tp3Price;
          exitReason = "TP3";
          qtyExited = position.remainingQty;
        }

        if (!exitPrice && position.trailActive) {
          position.trailStop = Math.max(position.trailStop, close[i] - atrVal * trailMult);
          position.stopLoss = Math.max(position.stopLoss, position.trailStop);
        }
      } else {
        if (high[i] >= sl) {
          exitPrice = sl;
          exitReason = position.trailActive ? "Trailing Stop" : "Stop Loss";
          qtyExited = position.remainingQty;
        } else if (!position.tp1Hit && low[i] <= tp1Price) {
          const partialQty = position.remainingQty * (tp1Pct / 100);
          const pnl = (entry - tp1Price) / entry;
          equity += partialQty * config.positionSize * pnl - 2 * partialQty * config.positionSize * config.commission;
          position.remainingQty -= partialQty;
          position.tp1Hit = true;
          position.stopLoss = entry - atrVal * 0.1;
          if (useTrailing) {
            position.trailActive = true;
            position.trailStop = close[i] + atrVal * trailMult;
          }
        }

        if (!exitPrice && position.tp1Hit && !position.tp2Hit && low[i] <= tp2Price) {
          const partialQty = position.remainingQty * (tp2Pct / (100 - tp1Pct)) * ((100 - tp1Pct) / 100);
          const effectiveQty = Math.min(partialQty, position.remainingQty * 0.5);
          const pnl = (entry - tp2Price) / entry;
          equity += effectiveQty * config.positionSize * pnl - 2 * effectiveQty * config.positionSize * config.commission;
          position.remainingQty -= effectiveQty;
          position.tp2Hit = true;
        }

        if (!exitPrice && position.tp2Hit && low[i] <= tp3Price) {
          exitPrice = tp3Price;
          exitReason = "TP3";
          qtyExited = position.remainingQty;
        }

        if (!exitPrice && position.trailActive) {
          position.trailStop = Math.min(position.trailStop, close[i] + atrVal * trailMult);
          position.stopLoss = Math.min(position.stopLoss, position.trailStop);
        }
      }

      if (exitPrice !== null) {
        const pnlPct = dir === "long"
          ? ((exitPrice - entry) / entry) * 100
          : ((entry - exitPrice) / entry) * 100;
        const pnlDollar = qtyExited * config.positionSize * (pnlPct / 100) - 2 * qtyExited * config.positionSize * config.commission;
        equity += pnlDollar;

        trades.push({
          entryTime: position.entryTime,
          exitTime: time,
          direction: dir,
          entryPrice: entry,
          exitPrice,
          pnlPercent: Math.round(pnlPct * 100) / 100,
          pnlDollar: Math.round(pnlDollar * 100) / 100,
          exitReason,
          barsHeld: i - position.entryBar,
        });
        position = null;
      }
    }

    if (!position && i > 0) {
      const prevSqz = sqz[i - 1];
      const currSqz = sqz[i];
      const sqzFiring = prevSqz && !currSqz;
      const momRising = !isNaN(mom[i]) && !isNaN(mom[i - 1]) && mom[i] > mom[i - 1];
      const momFalling = !isNaN(mom[i]) && !isNaN(mom[i - 1]) && mom[i] < mom[i - 1];
      const momPositive = !isNaN(mom[i]) && mom[i] > 0;
      const momNegative = !isNaN(mom[i]) && mom[i] < 0;

      const hullUp = !useHull || (hull && !isNaN(hull[i]) && !isNaN(hull[i - 1]) && hull[i] > hull[i - 1]);
      const hullDown = !useHull || (hull && !isNaN(hull[i]) && !isNaN(hull[i - 1]) && hull[i] < hull[i - 1]);
      const adxOk = !useAdx || (adxVals && !isNaN(adxVals[i]) && adxVals[i] > adxThresh);
      const rsiLongOk = !useRsi || (rsiVals && !isNaN(rsiVals[i]) && rsiVals[i] < rsiOBLevel);
      const rsiShortOk = !useRsi || (rsiVals && !isNaN(rsiVals[i]) && rsiVals[i] > rsiOSLevel);
      const volOk = !useVol || (volSma && !isNaN(volSma[i]) && volume[i] > volSma[i] * volMult);

      const atrVal = isNaN(atrVals[i]) ? close[i] * 0.02 : atrVals[i];

      const longCondition = (sqzFiring || momRising) && momPositive && hullUp && adxOk && rsiLongOk && volOk;
      const shortCondition = (sqzFiring || momFalling) && momNegative && hullDown && adxOk && rsiShortOk && volOk;

      if (longCondition && tradeDir !== "Short Only") {
        position = {
          direction: "long",
          entryPrice: close[i],
          entryBar: i,
          entryTime: time,
          size: 1,
          remainingQty: 1,
          stopLoss: close[i] - atrVal * slMult,
          tp1Hit: false,
          tp2Hit: false,
          trailStop: close[i] - atrVal * trailMult,
          trailActive: false,
        };
      } else if (shortCondition && tradeDir !== "Long Only") {
        position = {
          direction: "short",
          entryPrice: close[i],
          entryBar: i,
          entryTime: time,
          size: 1,
          remainingQty: 1,
          stopLoss: close[i] + atrVal * slMult,
          tp1Hit: false,
          tp2Hit: false,
          trailStop: close[i] + atrVal * trailMult,
          trailActive: false,
        };
      }
    }

    equityCurve.push({ time, equity });
  }

  if (position) {
    const lastClose = close[n - 1];
    const pnlPct = position.direction === "long"
      ? ((lastClose - position.entryPrice) / position.entryPrice) * 100
      : ((position.entryPrice - lastClose) / position.entryPrice) * 100;
    const pnlDollar = position.remainingQty * config.positionSize * (pnlPct / 100) - 2 * config.positionSize * config.commission;
    equity += pnlDollar;
    trades.push({
      entryTime: position.entryTime,
      exitTime: new Date(candles[n - 1].time).toISOString(),
      direction: position.direction,
      entryPrice: position.entryPrice,
      exitPrice: lastClose,
      pnlPercent: Math.round(pnlPct * 100) / 100,
      pnlDollar: Math.round(pnlDollar * 100) / 100,
      exitReason: "Open Position",
      barsHeld: n - 1 - position.entryBar,
    });
  }

  const wins = trades.filter(t => t.pnlPercent > 0);
  const losses = trades.filter(t => t.pnlPercent <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnlDollar, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlDollar, 0));
  const netProfitPercent = ((equity - config.initialCapital) / config.initialCapital) * 100;

  let maxEquity = config.initialCapital;
  let maxDrawdown = 0;
  for (const pt of equityCurve) {
    maxEquity = Math.max(maxEquity, pt.equity);
    const dd = ((maxEquity - pt.equity) / maxEquity) * 100;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  return {
    ticker,
    timeframe,
    netProfitPercent: Math.round(netProfitPercent * 100) / 100,
    winRatePercent: trades.length > 0 ? Math.round((wins.length / trades.length) * 10000) / 100 : 0,
    maxDrawdownPercent: Math.round(maxDrawdown * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0,
    totalTrades: trades.length,
    params,
    trades,
    equityCurve: equityCurve.filter((_, idx) => idx % Math.max(1, Math.floor(equityCurve.length / 500)) === 0),
  };
}
