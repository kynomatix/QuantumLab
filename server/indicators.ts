export function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result[i] = sum / period;
  }
  return result;
}

export function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(prev)) {
      if (i >= period - 1) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += data[j];
        prev = sum / period;
        result[i] = prev;
      }
    } else {
      prev = data[i] * k + prev * (1 - k);
      result[i] = prev;
    }
  }
  return result;
}

export function wma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - period + 1 + j] * (j + 1);
    }
    result[i] = sum / denom;
  }
  return result;
}

export function hullMa(data: number[], period: number): number[] {
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));
  const wma1 = wma(data, halfPeriod);
  const wma2 = wma(data, period);
  const diff: number[] = [];
  for (let i = 0; i < data.length; i++) {
    diff.push(isNaN(wma1[i]) || isNaN(wma2[i]) ? NaN : 2 * wma1[i] - wma2[i]);
  }
  return wma(diff, sqrtPeriod);
}

export function stdev(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    const mean = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (data[j] - mean) ** 2;
    result[i] = Math.sqrt(variance / period);
  }
  return result;
}

export function bollingerBands(data: number[], period: number, mult: number): { upper: number[]; basis: number[]; lower: number[] } {
  const basis = sma(data, period);
  const sd = stdev(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < data.length; i++) {
    upper.push(isNaN(basis[i]) ? NaN : basis[i] + mult * sd[i]);
    lower.push(isNaN(basis[i]) ? NaN : basis[i] - mult * sd[i]);
  }
  return { upper, basis, lower };
}

export function trueRange(high: number[], low: number[], close: number[]): number[] {
  const result: number[] = [high[0] - low[0]];
  for (let i = 1; i < high.length; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    result.push(Math.max(hl, hc, lc));
  }
  return result;
}

export function atr(high: number[], low: number[], close: number[], period: number): number[] {
  const tr = trueRange(high, low, close);
  return ema(tr, period);
}

export function keltnerChannel(close: number[], high: number[], low: number[], emaLen: number, atrLen: number, mult: number): { upper: number[]; basis: number[]; lower: number[] } {
  const basis = ema(close, emaLen);
  const atrVals = atr(high, low, close, atrLen);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < close.length; i++) {
    upper.push(isNaN(basis[i]) || isNaN(atrVals[i]) ? NaN : basis[i] + mult * atrVals[i]);
    lower.push(isNaN(basis[i]) || isNaN(atrVals[i]) ? NaN : basis[i] - mult * atrVals[i]);
  }
  return { upper, basis, lower };
}

export function rsi(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  if (data.length < period + 1) return result;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

export function adx(high: number[], low: number[], close: number[], period: number): number[] {
  const result: number[] = new Array(high.length).fill(NaN);
  if (high.length < period * 2) return result;
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  for (let i = 1; i < high.length; i++) {
    const upMove = high[i] - high[i - 1];
    const downMove = low[i - 1] - low[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const atrVals = atr(high, low, close, period);
  const smoothPlusDM = ema(plusDM, period);
  const smoothMinusDM = ema(minusDM, period);
  const dx: number[] = [];
  for (let i = 0; i < high.length; i++) {
    if (isNaN(atrVals[i]) || atrVals[i] === 0 || isNaN(smoothPlusDM[i])) {
      dx.push(NaN);
    } else {
      const plusDI = (smoothPlusDM[i] / atrVals[i]) * 100;
      const minusDI = (smoothMinusDM[i] / atrVals[i]) * 100;
      const sum = plusDI + minusDI;
      dx.push(sum === 0 ? 0 : (Math.abs(plusDI - minusDI) / sum) * 100);
    }
  }
  const adxVals = ema(dx.map(v => isNaN(v) ? 0 : v), period);
  for (let i = 0; i < high.length; i++) {
    result[i] = adxVals[i];
  }
  return result;
}

export function linreg(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let j = 0; j < period; j++) {
      sumX += j;
      sumY += data[i - period + 1 + j];
      sumXY += j * data[i - period + 1 + j];
      sumX2 += j * j;
    }
    const slope = (period * sumXY - sumX * sumY) / (period * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / period;
    result[i] = intercept + slope * (period - 1);
  }
  return result;
}

export function volumeSma(volume: number[], period: number): number[] {
  return sma(volume, period);
}

export function squeeze(bbUpper: number[], bbLower: number[], kcUpper: number[], kcLower: number[]): boolean[] {
  const result: boolean[] = [];
  for (let i = 0; i < bbUpper.length; i++) {
    if (isNaN(bbUpper[i]) || isNaN(kcUpper[i])) {
      result.push(false);
    } else {
      result.push(bbLower[i] > kcLower[i] && bbUpper[i] < kcUpper[i]);
    }
  }
  return result;
}
