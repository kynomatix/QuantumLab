import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  History, CheckCircle2, Clock, TrendingUp, BarChart3,
  ChevronRight, Loader2, Activity,
} from "lucide-react";
import type { OptimizationRun, Strategy } from "@shared/schema";

export default function RunHistory() {
  const { data: runs, isLoading } = useQuery<OptimizationRun[]>({
    queryKey: ["/api/runs"],
  });

  const { data: strategies } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const strategyMap = new Map<number, Strategy>();
  strategies?.forEach(s => strategyMap.set(s.id, s));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const completedRuns = runs?.filter(r => r.status === "complete") ?? [];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-history-page-title">
          <History className="w-5 h-5 text-primary" />
          Run History
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {completedRuns.length} completed run{completedRuns.length !== 1 ? "s" : ""}
        </p>
      </div>

      {completedRuns.length === 0 ? (
        <Card className="p-12 text-center">
          <Activity className="w-10 h-10 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-4">
            No optimization runs completed yet. Go to Setup to run your first backtest.
          </p>
          <Link href="/">
            <Button variant="secondary" size="sm" data-testid="button-go-setup">
              Go to Setup
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {completedRuns.map((run) => {
            const strategy = strategyMap.get(run.strategyId);
            const tickers = (run.tickers as string[]).map(t => t.split("/")[0]);
            const timeframes = run.timeframes as string[];
            const date = new Date(run.createdAt);

            return (
              <Link key={run.id} href={`/history/${run.id}`}>
                <Card
                  className="p-4 cursor-pointer hover-elevate active-elevate-2"
                  data-testid={`history-run-card-${run.id}`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center w-9 h-9 rounded-md bg-trading-profit/10 flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-trading-profit" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" data-testid={`history-run-tickers-${run.id}`}>
                            {tickers.join(", ")}
                          </span>
                          <span className="text-xs text-muted-foreground">/</span>
                          <span className="text-xs text-muted-foreground">{timeframes.join(", ")}</span>
                          {strategy && (
                            <Badge variant="outline" className="text-[10px] no-default-active-elevate">
                              {strategy.name}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            {run.totalConfigsTested?.toLocaleString() ?? "?"} configs
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] no-default-active-elevate"
                          >
                            {run.mode === "smoke" ? "Smoke Test" : "Full Sweep"}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {run.startDate} to {run.endDate}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
