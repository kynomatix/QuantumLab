import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp, TrendingDown, Percent, BarChart3, Download, Copy,
  ArrowUpDown, ChevronDown, ChevronUp, Activity, Zap, ArrowLeft,
  CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Area, AreaChart,
} from "recharts";
import type { JobResult, BacktestResult, TradeRecord } from "@shared/schema";
import { calculateRiskAnalysis } from "@/lib/risk-analysis";
import RiskManagementPanel from "@/components/RiskManagementPanel";

type SortKey = "netProfitPercent" | "winRatePercent" | "maxDrawdownPercent" | "profitFactor" | "totalTrades";
type SortDir = "asc" | "desc";

export default function Results() {
  const params = useParams<{ jobId: string }>();
  const [selectedConfig, setSelectedConfig] = useState<BacktestResult | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("netProfitPercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedCombo, setExpandedCombo] = useState<string | null>(null);
  const [tradeSort, setTradeSort] = useState<{ key: keyof TradeRecord; dir: SortDir }>({ key: "entryTime", dir: "desc" });

  const [pollCount, setPollCount] = useState(0);
  const maxPolls = 15;

  const { data: results, isLoading, error } = useQuery<JobResult>({
    queryKey: ["/api/job", params.jobId, "results"],
    queryFn: async () => {
      const res = await fetch(`/api/job/${params.jobId}/results`);
      if (!res.ok) {
        setPollCount(c => c + 1);
        throw new Error("Results not available");
      }
      return res.json();
    },
    refetchInterval: (query) => {
      if (query.state.data) return false;
      if (pollCount >= maxPolls) return false;
      return 2000;
    },
    retry: false,
  });

  const sortedConfigs = useMemo(() => {
    if (!results) return [];
    const bestPerCombo = new Map<string, BacktestResult>();
    for (const config of results.configs) {
      const key = `${config.ticker}|${config.timeframe}`;
      const existing = bestPerCombo.get(key);
      if (!existing || config.netProfitPercent > existing.netProfitPercent) {
        bestPerCombo.set(key, config);
      }
    }
    const arr = Array.from(bestPerCombo.values());
    arr.sort((a, b) => {
      const mult = sortDir === "desc" ? -1 : 1;
      if (sortKey === "maxDrawdownPercent") return (a[sortKey] - b[sortKey]) * -mult;
      return (a[sortKey] - b[sortKey]) * mult;
    });
    return arr;
  }, [results, sortKey, sortDir]);

  const bestProfit = useMemo(() => {
    if (!results || results.configs.length === 0) return 0;
    return Math.max(...results.configs.map(c => c.netProfitPercent));
  }, [results]);

  const bestWinRate = useMemo(() => {
    if (!results || results.configs.length === 0) return 0;
    return Math.max(...results.configs.map(c => c.winRatePercent));
  }, [results]);

  const lowestDrawdown = useMemo(() => {
    if (!results || results.configs.length === 0) return 0;
    return Math.min(...results.configs.map(c => c.maxDrawdownPercent));
  }, [results]);

  const bestPF = useMemo(() => {
    if (!results || results.configs.length === 0) return 0;
    return Math.max(...results.configs.map(c => c.profitFactor));
  }, [results]);

  const riskAnalysis = useMemo(() => {
    if (!selectedConfig) return null;
    return calculateRiskAnalysis(
      selectedConfig.trades,
      selectedConfig.netProfitPercent,
      selectedConfig.maxDrawdownPercent,
      selectedConfig.winRatePercent,
      selectedConfig.equityCurve
    );
  }, [selectedConfig]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedTrades = useMemo(() => {
    if (!selectedConfig) return [];
    return [...selectedConfig.trades].sort((a, b) => {
      const key = tradeSort.key;
      const mult = tradeSort.dir === "desc" ? -1 : 1;
      if (typeof a[key] === "number" && typeof b[key] === "number") {
        return ((a[key] as number) - (b[key] as number)) * mult;
      }
      return String(a[key]).localeCompare(String(b[key])) * mult;
    });
  }, [selectedConfig, tradeSort]);

  const handleDownloadCSV = () => {
    window.open(`/api/export/csv/${params.jobId}`, "_blank");
  };

  const handleCopyBestConfig = () => {
    if (!selectedConfig && sortedConfigs.length > 0) {
      const best = sortedConfigs[0];
      const lines = Object.entries(best.params).map(([k, v]) => `${k} = ${v}`);
      navigator.clipboard.writeText(lines.join("\n"));
    } else if (selectedConfig) {
      const lines = Object.entries(selectedConfig.params).map(([k, v]) => `${k} = ${v}`);
      navigator.clipboard.writeText(lines.join("\n"));
    }
  };

  const stillPolling = !results && pollCount < maxPolls;

  if (isLoading || stillPolling) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-5">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-muted/30" />
            <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
            <div className="absolute inset-2 rounded-full border-4 border-t-transparent border-r-primary/50 border-b-transparent border-l-transparent animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            <Activity className="absolute inset-0 m-auto w-5 h-5 text-primary/70" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium" data-testid="text-loading-results">Preparing results...</p>
            <p className="text-xs text-muted-foreground">Finalizing optimization data</p>
          </div>
          {pollCount > 3 && (
            <p className="text-xs text-muted-foreground animate-pulse">Still processing, hang tight...</p>
          )}
        </div>
      </div>
    );
  }

  if (error || !results || results.configs.length === 0) {
    const hasEmptyResults = results && results.configs.length === 0;
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-5">
          <div className="relative mx-auto w-16 h-16">
            <div className="absolute inset-0 rounded-full bg-trading-loss/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-trading-loss" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium" data-testid="text-no-results">
              {hasEmptyResults ? "No results found" : "Results unavailable"}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {hasEmptyResults
                ? "The optimization completed but produced no results. This usually happens when the data fetch fails (date range too long) or no parameter combinations met the minimum trade threshold."
                : "The optimization may have encountered an issue. You can go back and try running it again."}
            </p>
          </div>
          <div className="flex items-center gap-3 justify-center">
            <Link href="/">
              <Button variant="secondary" size="sm" data-testid="button-back-home">
                <ArrowLeft className="w-3 h-3 mr-1" /> Back to Setup
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-results-title">Results Dashboard</h2>
            <p className="text-xs text-muted-foreground">
              {results.totalConfigsTested.toLocaleString()} configurations tested
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={handleDownloadCSV} data-testid="button-download-csv">
            <Download className="w-3 h-3 mr-1" /> CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCopyBestConfig} data-testid="button-copy-config">
            <Copy className="w-3 h-3 mr-1" /> Copy Best
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard
          label="Best Net Profit"
          value={`${bestProfit > 0 ? "+" : ""}${bestProfit.toFixed(2)}%`}
          icon={<TrendingUp className="w-4 h-4" />}
          color={bestProfit >= 0 ? "text-trading-profit" : "text-trading-loss"}
          bgColor={bestProfit >= 0 ? "bg-trading-profit/10" : "bg-trading-loss/10"}
          testId="summary-profit"
        />
        <SummaryCard
          label="Best Win Rate"
          value={`${bestWinRate.toFixed(1)}%`}
          icon={<Percent className="w-4 h-4" />}
          color="text-trading-info"
          bgColor="bg-trading-info/10"
          testId="summary-winrate"
        />
        <SummaryCard
          label="Lowest Drawdown"
          value={`${lowestDrawdown.toFixed(1)}%`}
          icon={<TrendingDown className="w-4 h-4" />}
          color="text-trading-warning"
          bgColor="bg-trading-warning/10"
          testId="summary-drawdown"
        />
        <SummaryCard
          label="Best Profit Factor"
          value={bestPF.toFixed(2)}
          icon={<BarChart3 className="w-4 h-4" />}
          color="text-primary"
          bgColor="bg-primary/10"
          testId="summary-pf"
        />
        <SummaryCard
          label="Configs Tested"
          value={results.totalConfigsTested.toLocaleString()}
          icon={<Zap className="w-4 h-4" />}
          color="text-foreground"
          bgColor="bg-muted/30"
          testId="summary-total"
        />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Best Configurations
          </h3>
          <span className="text-xs text-muted-foreground">{sortedConfigs.length} combo{sortedConfigs.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-configs">
            <thead>
              <tr className="border-b border-border/30 text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left py-2.5 px-4">Ticker</th>
                <th className="text-left py-2.5 px-2">TF</th>
                <SortHeader label="Net Profit %" sortKey="netProfitPercent" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortHeader label="Win Rate %" sortKey="winRatePercent" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortHeader label="Max DD %" sortKey="maxDrawdownPercent" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortHeader label="PF" sortKey="profitFactor" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortHeader label="Trades" sortKey="totalTrades" current={sortKey} dir={sortDir} onClick={handleSort} />
                <th className="py-2.5 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {sortedConfigs.map((config) => {
                const key = `${config.ticker}|${config.timeframe}`;
                const comboResults = results.bestByCombo[key] || [];
                const isExpanded = expandedCombo === key;
                const name = config.ticker.split("/")[0];
                return (
                  <ConfigRow
                    key={key}
                    config={config}
                    name={name}
                    isExpanded={isExpanded}
                    comboResults={comboResults}
                    onToggleExpand={() => setExpandedCombo(isExpanded ? null : key)}
                    onSelectConfig={(c) => setSelectedConfig(c)}
                    selectedConfig={selectedConfig}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedConfig && (
        <Tabs defaultValue="equity" className="space-y-4">
          <TabsList data-testid="tabs-detail">
            <TabsTrigger value="equity" data-testid="tab-equity">Equity Curve</TabsTrigger>
            <TabsTrigger value="risk" data-testid="tab-risk">Risk Management</TabsTrigger>
            <TabsTrigger value="trades" data-testid="tab-trades">Trade Log</TabsTrigger>
            <TabsTrigger value="params" data-testid="tab-params">Parameters</TabsTrigger>
          </TabsList>

          <TabsContent value="equity">
            <Card className="p-4">
              <div className="flex items-center justify-between gap-1 mb-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-trading-profit" />
                  Equity Curve — {selectedConfig.ticker.split("/")[0]} {selectedConfig.timeframe}
                </h3>
                <Badge variant="outline" className="text-xs font-mono">
                  {selectedConfig.netProfitPercent > 0 ? "+" : ""}{selectedConfig.netProfitPercent.toFixed(2)}%
                </Badge>
              </div>
              <div className="h-[350px]" data-testid="chart-equity">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={selectedConfig.equityCurve}>
                    <defs>
                      <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#26a69a" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#26a69a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 10%, 18%)" />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 10 }}
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}
                      stroke="hsl(225, 10%, 18%)"
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 10 }}
                      stroke="hsl(225, 10%, 18%)"
                      tickFormatter={(val) => `$${val.toFixed(0)}`}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "hsl(228, 14%, 10%)",
                        border: "1px solid hsl(225, 10%, 18%)",
                        borderRadius: "6px",
                        fontSize: "12px",
                        color: "hsl(220, 13%, 91%)",
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, "Equity"]}
                      labelFormatter={(label) => new Date(label).toLocaleString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="#26a69a"
                      strokeWidth={1.5}
                      fill="url(#equityGradient)"
                      dot={false}
                      activeDot={{ r: 3, fill: "#26a69a" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="risk">
            {riskAnalysis && (
              <RiskManagementPanel
                analysis={riskAnalysis}
                ticker={selectedConfig.ticker}
                timeframe={selectedConfig.timeframe}
              />
            )}
          </TabsContent>

          <TabsContent value="trades">
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-1">
                <h3 className="text-sm font-semibold">{selectedConfig.trades.length} Trades</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] bg-trading-profit/10 text-trading-profit">
                    {selectedConfig.trades.filter(t => t.pnlPercent > 0).length} wins
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] bg-trading-loss/10 text-trading-loss">
                    {selectedConfig.trades.filter(t => t.pnlPercent <= 0).length} losses
                  </Badge>
                </div>
              </div>
              <ScrollArea className="max-h-[400px]">
                <table className="w-full text-xs" data-testid="table-trades">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border/30 text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="text-left py-2 px-3">Entry</th>
                      <th className="text-left py-2 px-2">Exit</th>
                      <th className="text-left py-2 px-2">Dir</th>
                      <th className="text-right py-2 px-2">Entry $</th>
                      <th className="text-right py-2 px-2">Exit $</th>
                      <th className="text-right py-2 px-2 cursor-pointer" onClick={() => setTradeSort(s => ({ key: "pnlPercent", dir: s.dir === "desc" ? "asc" : "desc" }))}>
                        PnL %
                      </th>
                      <th className="text-right py-2 px-2">PnL $</th>
                      <th className="text-left py-2 px-2">Reason</th>
                      <th className="text-right py-2 px-2">Bars</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTrades.map((trade, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-border/10 ${
                          trade.pnlPercent > 0 ? "bg-trading-profit/[0.03]" : "bg-trading-loss/[0.03]"
                        }`}
                        data-testid={`trade-row-${idx}`}
                      >
                        <td className="py-2 px-3 font-mono text-muted-foreground">{formatTradeTime(trade.entryTime)}</td>
                        <td className="py-2 px-2 font-mono text-muted-foreground">{formatTradeTime(trade.exitTime)}</td>
                        <td className="py-2 px-2">
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${trade.direction === "long" ? "text-trading-profit border-trading-profit/30" : "text-trading-loss border-trading-loss/30"}`}
                          >
                            {trade.direction.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{trade.entryPrice.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono">{trade.exitPrice.toFixed(2)}</td>
                        <td className={`py-2 px-2 text-right font-mono font-medium ${trade.pnlPercent >= 0 ? "text-trading-profit" : "text-trading-loss"}`}>
                          {trade.pnlPercent > 0 ? "+" : ""}{trade.pnlPercent.toFixed(2)}%
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${trade.pnlDollar >= 0 ? "text-trading-profit" : "text-trading-loss"}`}>
                          {trade.pnlDollar > 0 ? "+" : ""}{trade.pnlDollar.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{trade.exitReason}</td>
                        <td className="py-2 px-2 text-right font-mono text-muted-foreground">{trade.barsHeld}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </Card>
          </TabsContent>

          <TabsContent value="params">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">
                Parameters — {selectedConfig.ticker.split("/")[0]} {selectedConfig.timeframe}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(selectedConfig.params).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-1 p-2.5 rounded-md bg-muted/20 border border-border/20" data-testid={`result-param-${key}`}>
                    <span className="text-xs font-mono text-muted-foreground">{key}</span>
                    <span className="text-xs font-mono font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {!selectedConfig && sortedConfigs.length > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Click on a configuration row above to view equity curve, trade log, and parameters</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, color, bgColor, testId }: {
  label: string; value: string; icon: any; color: string; bgColor: string; testId: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-md ${bgColor}`}>
          <div className={color}>{icon}</div>
        </div>
      </div>
      <p className={`text-xl font-bold font-mono ${color}`} data-testid={testId}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </Card>
  );
}

function SortHeader({ label, sortKey, current, dir, onClick }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: (key: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="text-right py-2.5 px-2 cursor-pointer select-none"
      onClick={() => onClick(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && (dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
        {!active && <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
      </span>
    </th>
  );
}

function ConfigRow({ config, name, isExpanded, comboResults, onToggleExpand, onSelectConfig, selectedConfig }: {
  config: BacktestResult;
  name: string;
  isExpanded: boolean;
  comboResults: BacktestResult[];
  onToggleExpand: () => void;
  onSelectConfig: (c: BacktestResult) => void;
  selectedConfig: BacktestResult | null;
}) {
  const isSelected = selectedConfig === config;
  return (
    <>
      <tr
        className={`border-b border-border/10 cursor-pointer transition-colors ${
          isSelected ? "bg-primary/5" : "hover:bg-muted/10"
        }`}
        onClick={() => onSelectConfig(config)}
        data-testid={`config-row-${name}-${config.timeframe}`}
      >
        <td className="py-2.5 px-4 font-medium">{name}</td>
        <td className="py-2.5 px-2"><Badge variant="outline" className="text-[10px]">{config.timeframe}</Badge></td>
        <td className={`py-2.5 px-2 text-right font-mono font-medium ${config.netProfitPercent >= 0 ? "text-trading-profit" : "text-trading-loss"}`}>
          {config.netProfitPercent > 0 ? "+" : ""}{config.netProfitPercent.toFixed(2)}%
        </td>
        <td className={`py-2.5 px-2 text-right font-mono ${config.winRatePercent >= 50 ? "text-trading-profit" : "text-trading-warning"}`}>
          {config.winRatePercent.toFixed(1)}%
        </td>
        <td className={`py-2.5 px-2 text-right font-mono ${config.maxDrawdownPercent <= 30 ? "text-trading-profit" : "text-trading-loss"}`}>
          {config.maxDrawdownPercent.toFixed(1)}%
        </td>
        <td className={`py-2.5 px-2 text-right font-mono ${config.profitFactor >= 1.5 ? "text-trading-profit" : "text-foreground"}`}>
          {config.profitFactor.toFixed(2)}
        </td>
        <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">{config.totalTrades}</td>
        <td className="py-2.5 px-2">
          {comboResults.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} className="p-1" data-testid={`button-expand-${name}`}>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </td>
      </tr>
      {isExpanded && comboResults.slice(1).map((r, idx) => (
        <tr
          key={idx}
          className={`border-b border-border/5 cursor-pointer text-muted-foreground ${
            selectedConfig === r ? "bg-primary/5" : "hover:bg-muted/5"
          }`}
          onClick={() => onSelectConfig(r)}
          data-testid={`config-sub-${name}-${idx}`}
        >
          <td className="py-2 px-4 pl-8 text-xs">#{idx + 2}</td>
          <td className="py-2 px-2"><Badge variant="outline" className="text-[10px]">{r.timeframe}</Badge></td>
          <td className={`py-2 px-2 text-right font-mono text-xs ${r.netProfitPercent >= 0 ? "text-trading-profit" : "text-trading-loss"}`}>
            {r.netProfitPercent > 0 ? "+" : ""}{r.netProfitPercent.toFixed(2)}%
          </td>
          <td className="py-2 px-2 text-right font-mono text-xs">{r.winRatePercent.toFixed(1)}%</td>
          <td className="py-2 px-2 text-right font-mono text-xs">{r.maxDrawdownPercent.toFixed(1)}%</td>
          <td className="py-2 px-2 text-right font-mono text-xs">{r.profitFactor.toFixed(2)}</td>
          <td className="py-2 px-2 text-right font-mono text-xs">{r.totalTrades}</td>
          <td></td>
        </tr>
      ))}
    </>
  );
}

function formatTradeTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
