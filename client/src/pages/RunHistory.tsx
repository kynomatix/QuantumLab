import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  History, CheckCircle2, Clock, TrendingUp, BarChart3,
  ChevronRight, Loader2, Activity, XCircle, AlertCircle, Trash2,
} from "lucide-react";
import type { OptimizationRun, Strategy } from "@shared/schema";

export default function RunHistory() {
  const { toast } = useToast();
  const { data: runs, isLoading } = useQuery<OptimizationRun[]>({
    queryKey: ["/api/runs"],
  });

  const { data: strategies } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/runs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      toast({ title: "Run deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete run", variant: "destructive" });
    },
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

  const allRuns = runs ?? [];

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2" data-testid="text-history-page-title">
          <History className="w-5 h-5 text-primary" />
          Run History
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {allRuns.length} run{allRuns.length !== 1 ? "s" : ""}
        </p>
      </div>

      {allRuns.length === 0 ? (
        <Card className="p-12 text-center">
          <Activity className="w-10 h-10 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-4">
            No optimization runs yet. Go to Setup to run your first backtest.
          </p>
          <Link href="/">
            <Button variant="secondary" size="sm" data-testid="button-go-setup">
              Go to Setup
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {allRuns.map((run) => {
            const strategy = strategyMap.get(run.strategyId);
            const tickers = (run.tickers as string[]).map(t => t.split("/")[0]);
            const timeframes = run.timeframes as string[];
            const date = new Date(run.createdAt);
            const isComplete = run.status === "complete";
            const isFailed = run.status === "failed";
            const isRunning = run.status === "running";

            const statusIcon = isComplete ? <CheckCircle2 className="w-4 h-4 text-trading-profit" /> :
              isFailed ? <XCircle className="w-4 h-4 text-trading-loss" /> :
              isRunning ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> :
              <AlertCircle className="w-4 h-4 text-trading-warning" />;

            const statusBg = isComplete ? "bg-trading-profit/10" :
              isFailed ? "bg-trading-loss/10" :
              isRunning ? "bg-primary/10" : "bg-trading-warning/10";

            return (
              <div key={run.id} className="flex items-center gap-2">
                <Link href={isComplete ? `/history/${run.id}` : "#"} className="flex-1">
                  <Card
                    className={`p-4 ${isComplete ? "cursor-pointer hover-elevate active-elevate-2" : "opacity-70"}`}
                    data-testid={`history-run-card-${run.id}`}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`flex items-center justify-center w-9 h-9 rounded-md ${statusBg} flex-shrink-0`}>
                          {statusIcon}
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
                              variant={isComplete ? "secondary" : isFailed ? "destructive" : "outline"}
                              className="text-[10px] no-default-active-elevate"
                            >
                              {isRunning ? "Running" : isFailed ? "Failed" : run.mode === "smoke" ? "Smoke Test" : "Full Sweep"}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {run.startDate} to {run.endDate}
                            </span>
                          </div>
                        </div>
                      </div>
                      {isComplete && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    </div>
                  </Card>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="flex-shrink-0 text-muted-foreground"
                  onClick={() => deleteMutation.mutate(run.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-run-${run.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
