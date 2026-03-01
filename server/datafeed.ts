import * as fs from "fs";
import * as path from "path";
import { log } from "./index";

const CACHE_DIR = path.join(process.cwd(), "cache");

interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(symbol: string, timeframe: string, startDate: string, endDate: string): string {
  const cleanSymbol = symbol.replace(/[/:]/g, "_");
  return `${cleanSymbol}_${timeframe}_${startDate}_${endDate}`;
}

function getCachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

function symbolToGateContract(symbol: string): string {
  const base = symbol.split("/")[0];
  return `${base}_USDT`;
}

function mapTimeframeToGate(tf: string): string {
  const map: Record<string, string> = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1h", "2h": "2h", "4h": "4h", "8h": "8h",
    "12h": "12h", "1d": "1d", "1w": "1w",
  };
  return map[tf] || tf;
}

async function fetchGateOHLCV(
  contract: string,
  timeframe: string,
  fromSec: number,
  toSec: number
): Promise<{ data: any[] | null; tooOld: boolean }> {
  const interval = mapTimeframeToGate(timeframe);
  const url = `https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=${contract}&interval=${interval}&from=${fromSec}&to=${toSec}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 400 && text.includes("too long ago")) {
      return { data: null, tooOld: true };
    }
    throw new Error(`Gate.io API error ${res.status}: ${text}`);
  }
  return { data: await res.json(), tooOld: false };
}

function getEarliestAllowedStart(timeframe: string): number {
  const tfSeconds = getTimeframeSeconds(timeframe);
  const maxCandles = 9500;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec - (tfSeconds * maxCandles);
}

export async function fetchOHLCV(
  symbol: string,
  timeframe: string,
  startDate: string,
  endDate: string,
  onProgress?: (msg: string) => void
): Promise<OHLCV[]> {
  ensureCacheDir();
  const cacheKey = getCacheKey(symbol, timeframe, startDate, endDate);
  const cachePath = getCachePath(cacheKey);

  if (fs.existsSync(cachePath)) {
    onProgress?.(`Loading cached data for ${symbol} ${timeframe}`);
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
    log(`Loaded ${cached.length} cached candles for ${symbol} ${timeframe}`);
    return cached;
  }

  const contract = symbolToGateContract(symbol);
  onProgress?.(`Fetching ${symbol} ${timeframe} from Gate.io...`);
  log(`Fetching OHLCV for ${contract} ${timeframe} from ${startDate} to ${endDate} via Gate.io`);

  const requestedStartSec = Math.floor(new Date(startDate).getTime() / 1000);
  const endSec = Math.floor(new Date(endDate).getTime() / 1000);
  const allCandles: OHLCV[] = [];

  const earliestAllowed = getEarliestAllowedStart(timeframe);
  let since = requestedStartSec;

  if (since < earliestAllowed) {
    const earliestDate = new Date(earliestAllowed * 1000).toISOString().split("T")[0];
    log(`Requested start ${startDate} is too far back for ${timeframe}. Gate.io limit ~9500 candles. Shifting to ${earliestDate}`);
    onProgress?.(`Date range adjusted: Gate.io only serves ~9500 ${timeframe} candles. Starting from ${earliestDate} instead of ${startDate}`);
    since = earliestAllowed;
  }

  let page = 0;
  let consecutiveTooOld = 0;

  while (since < endSec) {
    try {
      const batchEnd = Math.min(since + getTimeframeSeconds(timeframe) * 2000, endSec);
      const { data: raw, tooOld } = await fetchGateOHLCV(contract, timeframe, since, batchEnd);

      if (tooOld) {
        consecutiveTooOld++;
        log(`Batch starting at ${new Date(since * 1000).toISOString()} too old for Gate.io, skipping forward`);
        since = Math.min(since + getTimeframeSeconds(timeframe) * 2000, endSec);
        if (consecutiveTooOld > 5) {
          const newStart = getEarliestAllowedStart(timeframe);
          if (newStart < endSec) {
            log(`Jumping to earliest allowed: ${new Date(newStart * 1000).toISOString()}`);
            onProgress?.(`Skipping to earliest available data...`);
            since = newStart;
            consecutiveTooOld = 0;
          } else {
            log(`No data available in requested range for ${symbol} ${timeframe}`);
            break;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }

      consecutiveTooOld = 0;

      if (!raw || raw.length === 0) {
        since = batchEnd;
        continue;
      }

      for (const candle of raw) {
        const ts = candle.t * 1000;
        if (ts > endSec * 1000) break;
        allCandles.push({
          time: ts,
          open: parseFloat(candle.o),
          high: parseFloat(candle.h),
          low: parseFloat(candle.l),
          close: parseFloat(candle.c),
          volume: parseFloat(candle.v || candle.sum || "0"),
        });
      }

      const lastTs = raw[raw.length - 1].t;
      if (lastTs <= since) break;
      since = lastTs + getTimeframeSeconds(timeframe);
      page++;

      if (page % 5 === 0) {
        onProgress?.(`Fetched ${allCandles.length} candles for ${symbol} ${timeframe}...`);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err: any) {
      log(`Error fetching ${symbol} from Gate.io: ${err.message}`);
      if (allCandles.length > 0) break;
      throw err;
    }
  }

  if (allCandles.length > 0) {
    const deduped = deduplicateCandles(allCandles);
    fs.writeFileSync(cachePath, JSON.stringify(deduped));
    log(`Cached ${deduped.length} candles for ${symbol} ${timeframe}`);
    onProgress?.(`Fetched ${deduped.length} candles for ${symbol} ${timeframe}`);
    return deduped;
  }

  onProgress?.(`No candle data available for ${symbol} ${timeframe} in the requested date range`);
  return allCandles;
}

function deduplicateCandles(candles: OHLCV[]): OHLCV[] {
  const seen = new Set<number>();
  const result: OHLCV[] = [];
  for (const c of candles) {
    if (!seen.has(c.time)) {
      seen.add(c.time);
      result.push(c);
    }
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

function getTimeframeSeconds(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "8h": 28800,
    "12h": 43200, "1d": 86400, "1w": 604800,
  };
  return map[tf] || 900;
}
