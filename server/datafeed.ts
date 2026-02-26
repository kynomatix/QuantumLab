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

  onProgress?.(`Fetching ${symbol} ${timeframe} from Binance...`);
  log(`Fetching OHLCV for ${symbol} ${timeframe} from ${startDate} to ${endDate}`);

  const ccxtModule = await import("ccxt");
  const ccxt = ccxtModule.default || ccxtModule;
  const BinanceUsdm = (ccxt as any).binanceusdm || (ccxt as any).default?.binanceusdm;
  if (!BinanceUsdm) throw new Error("ccxt binanceusdm not found");
  const exchange = new BinanceUsdm({ enableRateLimit: true });

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const allCandles: OHLCV[] = [];
  let since = startMs;
  let page = 0;

  while (since < endMs) {
    try {
      const raw = await exchange.fetchOHLCV(symbol, timeframe, since, 1000);
      if (!raw || raw.length === 0) break;

      for (const candle of raw) {
        if (candle[0] > endMs) break;
        allCandles.push({
          time: candle[0],
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5],
        });
      }

      since = raw[raw.length - 1][0] + 1;
      page++;
      if (page % 5 === 0) {
        onProgress?.(`Fetched ${allCandles.length} candles for ${symbol} ${timeframe}...`);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err: any) {
      log(`Error fetching ${symbol}: ${err.message}`);
      if (allCandles.length > 0) break;
      throw err;
    }
  }

  if (allCandles.length > 0) {
    fs.writeFileSync(cachePath, JSON.stringify(allCandles));
    log(`Cached ${allCandles.length} candles for ${symbol} ${timeframe}`);
  }

  onProgress?.(`Fetched ${allCandles.length} candles for ${symbol} ${timeframe}`);
  return allCandles;
}
