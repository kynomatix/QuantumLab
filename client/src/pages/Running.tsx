import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, X, TrendingUp, Percent, BarChart3,
  Clock, Activity, CheckCircle2, AlertCircle,
} from "lucide-react";
import type { JobProgress } from "@shared/schema";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default function Running() {
  const params = useParams<{ jobId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let isMounted = true;

    function connect() {
      if (!isMounted) return;
      const es = new EventSource(`/api/job/${params.jobId}/progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data: JobProgress = JSON.parse(event.data);
          setProgress(data);
          if (data.status === "complete") {
            es.close();
            navigate(`/results/${params.jobId}`);
          }
          if (data.status === "error") {
            es.close();
            toast({ title: "Optimization failed", description: data.error, variant: "destructive" });
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        if (isMounted) {
          reconnectTimer = setTimeout(async () => {
            try {
              const res = await fetch(`/api/job/${params.jobId}/results`);
              if (res.ok) {
                navigate(`/results/${params.jobId}`);
                return;
              }
            } catch {}
            connect();
          }, 3000);
        }
      };
    }

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      eventSourceRef.current?.close();
    };
  }, [params.jobId, navigate, toast]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await apiRequest("POST", `/api/job/${params.jobId}/cancel`);
      eventSourceRef.current?.close();
      navigate("/");
    } catch (err: any) {
      toast({ title: "Failed to cancel", variant: "destructive" });
    }
    setCancelling(false);
  };

  const statusColor = progress?.status === "error" ? "text-trading-loss" :
    progress?.status === "complete" ? "text-trading-profit" : "text-primary";

  const statusIcon = progress?.status === "error" ? <AlertCircle className="w-5 h-5" /> :
    progress?.status === "complete" ? <CheckCircle2 className="w-5 h-5" /> :
    <Loader2 className="w-5 h-5 animate-spin" />;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-3">
            <div className={statusColor}>{statusIcon}</div>
            <div>
              <h2 className="text-lg font-semibold" data-testid="text-running-title">Optimization Running</h2>
              <p className="text-sm text-muted-foreground" data-testid="text-running-stage">
                {progress?.stage || "Initializing..."}
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling || progress?.status === "complete" || progress?.status === "error"}
            data-testid="button-cancel"
          >
            {cancelling ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <X className="w-3 h-3 mr-1" />}
            Cancel
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress?.percent ?? 0}% complete</span>
            <span>
              {progress?.current?.toLocaleString() ?? 0} / {progress?.total?.toLocaleString() ?? 0}
            </span>
          </div>
          <Progress value={progress?.percent ?? 0} className="h-2" data-testid="progress-bar" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Elapsed</p>
              <p className="font-mono text-sm" data-testid="text-elapsed">
                {progress ? formatDuration(progress.elapsed) : "--"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">ETA</p>
              <p className="font-mono text-sm" data-testid="text-eta">
                {progress?.eta ? formatDuration(progress.eta) : "--"}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {progress?.bestSoFar && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-trading-profit" />
            Best So Far
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              label="Net Profit"
              value={`${progress.bestSoFar.netProfitPercent > 0 ? "+" : ""}${progress.bestSoFar.netProfitPercent.toFixed(2)}%`}
              color={progress.bestSoFar.netProfitPercent >= 0 ? "text-trading-profit" : "text-trading-loss"}
              testId="text-best-profit"
            />
            <MetricCard
              label="Win Rate"
              value={`${progress.bestSoFar.winRatePercent.toFixed(1)}%`}
              color={progress.bestSoFar.winRatePercent >= 50 ? "text-trading-profit" : "text-trading-warning"}
              testId="text-best-winrate"
            />
            <MetricCard
              label="Max Drawdown"
              value={`${progress.bestSoFar.maxDrawdownPercent.toFixed(1)}%`}
              color={progress.bestSoFar.maxDrawdownPercent <= 30 ? "text-trading-profit" : "text-trading-loss"}
              testId="text-best-drawdown"
            />
            <MetricCard
              label="Profit Factor"
              value={progress.bestSoFar.profitFactor.toFixed(2)}
              color={progress.bestSoFar.profitFactor >= 1.5 ? "text-trading-profit" : "text-trading-warning"}
              testId="text-best-pf"
            />
          </div>
        </Card>
      )}

      {progress?.tickerProgress && Object.keys(progress.tickerProgress).length > 1 && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Sweep Progress
          </h3>
          <div className="space-y-2">
            {Object.entries(progress.tickerProgress).map(([key, val]) => {
              const [ticker, tf] = key.split("|");
              const name = ticker.split("/")[0];
              return (
                <div key={key} className="flex items-center justify-between gap-1 py-1.5 px-3 rounded-md bg-muted/20" data-testid={`sweep-${name}-${tf}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">{name}</span>
                    <Badge variant="outline" className="text-[10px]">{tf}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {val.best !== undefined && (
                      <span className={`text-xs font-mono ${val.best >= 0 ? "text-trading-profit" : "text-trading-loss"}`}>
                        {val.best > 0 ? "+" : ""}{val.best.toFixed(1)}%
                      </span>
                    )}
                    <Badge
                      variant={val.status === "complete" ? "default" : val.status === "running" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {val.status === "complete" && <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
                      {val.status === "running" && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
                      {val.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ label, value, color, testId }: { label: string; value: string; color: string; testId: string }) {
  return (
    <div className="text-center p-3 rounded-md bg-muted/20">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${color}`} data-testid={testId}>{value}</p>
    </div>
  );
}
