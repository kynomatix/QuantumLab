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

async function createExchange(): Promise<{ exchange: any; name: string }> {
  const ccxtModule = await import("ccxt");
  const ccxt = ccxtModule.default || ccxtModule;

  const exchanges = [
    { name: "gateio", cls: (ccxt as any).gateio, opts: { enableRateLimit: true, options: { defaultType: "swap" } } },
    { name: "kraken", cls: (ccxt as any).kraken, opts: { enableRateLimit: true } },
    { name: "bitget", cls: (ccxt as any).bitget, opts: { enableRateLimit: true, options: { defaultType: "swap" } } },
  ];

  for (const ex of exchanges) {
    if (!ex.cls) continue;
    try {
      const instance = new ex.cls(ex.opts);
      await instance.loadMarkets();
      log(`Connected to ${ex.name} exchange`);
      return { exchange: instance, name: ex.name };
    } catch (err: any) {
      log(`${ex.name} unavailable: ${err.message}`);
    }
  }
  throw new Error("No exchange available. All exchanges failed to connect.");
}

let exchangeCache: { exchange: any; name: string } | null = null;

async function getExchange(): Promise<{ exchange: any; name: string }> {
  if (exchangeCache) return exchangeCache;
  exchangeCache = await createExchange();
  return exchangeCache;
}

function resolveSymbol(symbol: string, exchangeName: string, exchange: any): string {
  const base = symbol.split("/")[0];

  const candidates = [
    symbol,
    `${base}/USDT:USDT`,
    `${base}/USDT`,
    `${base}/USD`,
  ];

  for (const s of candidates) {
    if (exchange.markets[s]) return s;
  }

  const available = Object.keys(exchange.markets)
    .filter(m => m.startsWith(base))
    .slice(0, 5);
  throw new Error(`Symbol ${symbol} (base: ${base}) not found on ${exchangeName}. Available: ${available.join(", ")}`);
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

  const { exchange, name: exchangeName } = await getExchange();
  const resolvedSymbol = resolveSymbol(symbol, exchangeName, exchange);

  onProgress?.(`Fetching ${symbol} ${timeframe} from ${exchangeName}...`);
  log(`Fetching OHLCV for ${resolvedSymbol} ${timeframe} from ${startDate} to ${endDate} via ${exchangeName}`);

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const allCandles: OHLCV[] = [];
  let since = startMs;
  let page = 0;

  while (since < endMs) {
    try {
      const raw = await exchange.fetchOHLCV(resolvedSymbol, timeframe, since, 1000);
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

      await new Promise(resolve => setTimeout(resolve, exchange.rateLimit || 200));
    } catch (err: any) {
      log(`Error fetching ${symbol} from ${exchangeName}: ${err.message}`);
      if (allCandles.length > 0) break;
      exchangeCache = null;
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
