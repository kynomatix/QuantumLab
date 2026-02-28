import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp, TrendingDown, Percent, BarChart3,
  ArrowUpDown, ChevronDown, ChevronUp, Activity, Zap, ArrowLeft,
  Loader2, XCircle, Copy,
} from "lucide-react";
import {
  ResponsiveContainer, Area, AreaChart, CartesianGrid, XAxis, YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";
import type { OptResult, OptimizationRun } from "@shared/schema";
import { calculateRiskAnalysis } from "@/lib/risk-analysis";
import RiskManagementPanel from "@/components/RiskManagementPanel";

type SortKey = "netProfitPercent" | "winRatePercent" | "maxDrawdownPercent" | "profitFactor" | "totalTrades";
type SortDir = "asc" | "desc";

export default function HistoryResults() {
  const params = useParams<{ runId: string }>();
  const runId = parseInt(params.runId);
  const [sortKey, setSortKey] = useState<SortKey>("netProfitPercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedResult, setSelectedResult] = useState<OptResult | null>(null);

  const { data: run } = useQuery<OptimizationRun>({
    queryKey: ["/api/runs", runId],
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) throw new Error("Run not found");
      return res.json();
    },
  });

  const { data: results, isLoading } = useQuery<OptResult[]>({
    queryKey: ["/api/runs", runId, "results"],
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/results`);
      if (!res.ok) throw new Error("No results");
      return res.json();
    },
  });

  const bestPerCombo = useMemo(() => {
    if (!results) return [];
    const map = new Map<string, OptResult>();
    for (const r of results) {
      const key = `${r.ticker}|${r.timeframe}`;
      const existing = map.get(key);
      if (!existing || r.netProfitPercent > existing.netProfitPercent) {
        map.set(key, r);
      }
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const mult = sortDir === "desc" ? -1 : 1;
      if (sortKey === "maxDrawdownPercent") return (a[sortKey] - b[sortKey]) * -mult;
      return (a[sortKey] - b[sortKey]) * mult;
    });
    return arr;
  }, [results, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const riskAnalysis = useMemo(() => {
    if (!selectedResult) return null;
    const trades = (selectedResult.trades as any[]) ?? [];
    const equityCurve = (selectedResult.equityCurve as any[]) ?? [];
    return calculateRiskAnalysis(
      trades,
      selectedResult.netProfitPercent,
      selectedResult.maxDrawdownPercent,
      selectedResult.winRatePercent,
      equityCurve
    );
  }, [selectedResult]);

  const handleCopyParams = () => {
    if (!selectedResult) return;
    const params = selectedResult.params as Record<string, any>;
    const lines = Object.entries(params).map(([k, v]) => `${k} = ${v}`);
    navigator.clipboard.writeText(lines.join("\n"));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <XCircle className="w-8 h-8 text-trading-loss mx-auto" />
          <p className="text-sm text-muted-foreground">No results found for this run.</p>
          <Link href="/strategies">
            <Button variant="secondary" size="sm" data-testid="button-back-strategies">
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to Strategies
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const bestProfit = Math.max(...results.map(r => r.netProfitPercent));
  const bestWinRate = Math.max(...results.map(r => r.winRatePercent));
  const lowestDD = Math.min(...results.map(r => r.maxDrawdownPercent));
  const bestPF = Math.max(...results.map(r => r.profitFactor));

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/strategies">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-lg font-semibold" data-testid="text-history-title">
              Run #{runId} Results
            </h2>
            <p className="text-xs text-muted-foreground">
              {run ? `${(run.tickers as string[]).map(t => t.split("/")[0]).join(", ")} / ${(run.timeframes as string[]).join(", ")} — ${new Date(run.createdAt).toLocaleDateString()}` : ""}
              {run?.totalConfigsTested ? ` — ${run.totalConfigsTested.toLocaleString()} configs tested` : ""}
            </p>
          </div>
        </div>
        {selectedResult && (
          <Button variant="secondary" size="sm" onClick={handleCopyParams} data-testid="button-copy-params">
            <Copy className="w-3 h-3 mr-1" /> Copy Params
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Best Profit" value={`${bestProfit > 0 ? "+" : ""}${bestProfit.toFixed(2)}%`} color={bestProfit >= 0 ? "text-trading-profit" : "text-trading-loss"} icon={<TrendingUp className="w-4 h-4" />} />
        <StatCard label="Best Win Rate" value={`${bestWinRate.toFixed(1)}%`} color="text-trading-info" icon={<Percent className="w-4 h-4" />} />
        <StatCard label="Lowest DD" value={`${lowestDD.toFixed(1)}%`} color="text-trading-warning" icon={<TrendingDown className="w-4 h-4" />} />
        <StatCard label="Best PF" value={bestPF.toFixed(2)} color="text-primary" icon={<BarChart3 className="w-4 h-4" />} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Best per Ticker/Timeframe
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-history-configs">
            <thead>
              <tr className="border-b border-border/30 text-xs text-muted-foreground uppercase tracking-wider">
                <th className="text-left py-2.5 px-4">Ticker</th>
                <th className="text-left py-2.5 px-2">TF</th>
                <SortTH label="Net Profit %" k="netProfitPercent" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortTH label="Win Rate %" k="winRatePercent" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortTH label="Max DD %" k="maxDrawdownPercent" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortTH label="PF" k="profitFactor" current={sortKey} dir={sortDir} onClick={handleSort} />
                <SortTH label="Trades" k="totalTrades" current={sortKey} dir={sortDir} onClick={handleSort} />
              </tr>
            </thead>
            <tbody>
              {bestPerCombo.map((r) => {
                const name = r.ticker.split("/")[0];
                const isSelected = selectedResult?.id === r.id;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border/10 cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/10"}`}
                    onClick={() => setSelectedResult(r)}
                    data-testid={`history-row-${r.id}`}
                  >
                    <td className="py-2.5 px-4 font-medium">{name}</td>
                    <td className="py-2.5 px-2"><Badge variant="outline" className="text-[10px]">{r.timeframe}</Badge></td>
                    <td className={`py-2.5 px-2 text-right font-mono font-medium ${r.netProfitPercent >= 0 ? "text-trading-profit" : "text-trading-loss"}`}>
                      {r.netProfitPercent > 0 ? "+" : ""}{r.netProfitPercent.toFixed(2)}%
                    </td>
                    <td className={`py-2.5 px-2 text-right font-mono ${r.winRatePercent >= 50 ? "text-trading-profit" : "text-trading-warning"}`}>
                      {r.winRatePercent.toFixed(1)}%
                    </td>
                    <td className={`py-2.5 px-2 text-right font-mono ${r.maxDrawdownPercent <= 30 ? "text-trading-profit" : "text-trading-loss"}`}>
                      {r.maxDrawdownPercent.toFixed(1)}%
                    </td>
                    <td className={`py-2.5 px-2 text-right font-mono ${r.profitFactor >= 1.5 ? "text-trading-profit" : "text-foreground"}`}>
                      {r.profitFactor.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">{r.totalTrades}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedResult && (
        <Tabs defaultValue="equity" className="space-y-4">
          <TabsList data-testid="tabs-history-detail">
            <TabsTrigger value="equity" data-testid="tab-history-equity">Equity Curve</TabsTrigger>
            <TabsTrigger value="risk" data-testid="tab-history-risk">Risk Management</TabsTrigger>
            <TabsTrigger value="params" data-testid="tab-history-params">Parameters</TabsTrigger>
            <TabsTrigger value="trades" data-testid="tab-history-trades">Trades</TabsTrigger>
          </TabsList>

          <TabsContent value="equity">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-trading-profit" />
                {selectedResult.ticker.split("/")[0]} {selectedResult.timeframe}
              </h3>
              {selectedResult.equityCurve && (selectedResult.equityCurve as any[]).length > 0 ? (
                <div className="h-[350px]" data-testid="chart-history-equity">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedResult.equityCurve as any[]}>
                      <defs>
                        <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#26a69a" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#26a69a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 10%, 18%)" />
                      <XAxis dataKey="time" tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 10 }} stroke="hsl(225, 10%, 18%)" tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", year: "2-digit" })} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 10 }} stroke="hsl(225, 10%, 18%)" tickFormatter={(v) => `$${v.toFixed(0)}`} />
                      <RechartsTooltip contentStyle={{ backgroundColor: "hsl(228, 14%, 10%)", border: "1px solid hsl(225, 10%, 18%)", borderRadius: "6px", fontSize: "12px", color: "hsl(220, 13%, 91%)" }} formatter={(value: number) => [`$${value.toFixed(2)}`, "Equity"]} labelFormatter={(l) => new Date(l).toLocaleString()} />
                      <Area type="monotone" dataKey="equity" stroke="#26a69a" strokeWidth={1.5} fill="url(#eqGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No equity curve data saved</p>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="risk">
            {riskAnalysis && (
              <RiskManagementPanel
                analysis={riskAnalysis}
                ticker={selectedResult.ticker}
                timeframe={selectedResult.timeframe}
              />
            )}
          </TabsContent>

          <TabsContent value="params">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Optimized Parameters</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(selectedResult.params as Record<string, any>).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-1 p-2.5 rounded-md bg-muted/20 border border-border/20" data-testid={`history-param-${key}`}>
                    <span className="text-xs font-mono text-muted-foreground">{key}</span>
                    <span className="text-xs font-mono font-medium">{String(value)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="trades">
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50">
                <h3 className="text-sm font-semibold">{(selectedResult.trades as any[])?.length ?? 0} Trades</h3>
              </div>
              <ScrollArea className="max-h-[400px]">
                <table className="w-full text-xs" data-testid="table-history-trades">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border/30 text-[10px] text-muted-foreground uppercase">
                      <th className="text-left py-2 px-3">Entry</th>
                      <th className="text-left py-2 px-2">Exit</th>
                      <th className="text-left py-2 px-2">Dir</th>
                      <th className="text-right py-2 px-2">PnL %</th>
                      <th className="text-right py-2 px-2">PnL $</th>
                      <th className="text-left py-2 px-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((selectedResult.trades as any[]) ?? []).map((t: any, idx: number) => (
                      <tr key={idx} className={`border-b border-border/10 ${t.pnlPercent > 0 ? "bg-trading-profit/[0.03]" : "bg-trading-loss/[0.03]"}`}>
                        <td className="py-2 px-3 font-mono text-muted-foreground">{new Date(t.entryTime).toLocaleDateString()}</td>
                        <td className="py-2 px-2 font-mono text-muted-foreground">{new Date(t.exitTime).toLocaleDateString()}</td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className={`text-[9px] ${t.direction === "long" ? "text-trading-profit" : "text-trading-loss"}`}>
                            {t.direction?.toUpperCase()}
                          </Badge>
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${t.pnlPercent >= 0 ? "text-trading-profit" : "text-trading-loss"}`}>
                          {t.pnlPercent > 0 ? "+" : ""}{t.pnlPercent?.toFixed(2)}%
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${t.pnlDollar >= 0 ? "text-trading-profit" : "text-trading-loss"}`}>
                          {t.pnlDollar > 0 ? "+" : ""}{t.pnlDollar?.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{t.exitReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: any }) {
  return (
    <Card className="p-4">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </Card>
  );
}

function SortTH({ label, k, current, dir, onClick }: { label: string; k: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void }) {
  const active = current === k;
  return (
    <th className="text-right py-2.5 px-2 cursor-pointer select-none" onClick={() => onClick(k)}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && (dir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
        {!active && <ArrowUpDown className="w-2.5 h-2.5 opacity-30" />}
      </span>
    </th>
  );
}
