import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Code2, Clock, ChevronRight, Trash2, Activity,
  TrendingUp, BarChart3, Loader2,
} from "lucide-react";
import type { Strategy, OptimizationRun } from "@shared/schema";

export default function Strategies() {
  const { toast } = useToast();

  const { data: strategies, isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/strategies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      toast({ title: "Strategy deleted" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-strategies-title">Strategy Library</h2>
          <p className="text-xs text-muted-foreground">
            {strategies?.length ?? 0} strategies saved
          </p>
        </div>
        <Link href="/">
          <Button size="sm" data-testid="button-new-strategy">
            <Plus className="w-3 h-3 mr-1" /> New Strategy
          </Button>
        </Link>
      </div>

      {(!strategies || strategies.length === 0) ? (
        <Card className="p-12 text-center">
          <Code2 className="w-10 h-10 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground mb-4">
            No strategies saved yet. Go to Setup to paste and save a strategy.
          </p>
          <Link href="/">
            <Button variant="secondary" size="sm" data-testid="button-go-setup">
              <Plus className="w-3 h-3 mr-1" /> Create First Strategy
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              onDelete={() => deleteMutation.mutate(strategy.id)}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyCard({ strategy, onDelete, isDeleting }: {
  strategy: Strategy;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { data: runs } = useQuery<OptimizationRun[]>({
    queryKey: ["/api/runs", { strategyId: strategy.id }],
    queryFn: async () => {
      const res = await fetch(`/api/runs?strategyId=${strategy.id}`);
      if (!res.ok) throw new Error("Failed to fetch runs");
      return res.json();
    },
  });

  const inputs = strategy.parsedInputs as any[];
  const optimizableCount = inputs?.filter((i: any) => i.optimizable).length ?? 0;
  const completedRuns = runs?.filter(r => r.status === "complete") ?? [];
  const latestRun = completedRuns[0];

  return (
    <Card className="p-0 overflow-hidden" data-testid={`strategy-card-${strategy.id}`}>
      <div className="p-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
            <h3 className="text-sm font-semibold truncate" data-testid={`text-strategy-name-${strategy.id}`}>
              {strategy.name}
            </h3>
          </div>
          {strategy.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{strategy.description}</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">
              {optimizableCount} optimizable params
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <Clock className="w-2.5 h-2.5 mr-1" />
              {new Date(strategy.createdAt).toLocaleDateString()}
            </Badge>
            {completedRuns.length > 0 && (
              <Badge variant="outline" className="text-[10px] text-trading-profit border-trading-profit/30">
                <Activity className="w-2.5 h-2.5 mr-1" />
                {completedRuns.length} run{completedRuns.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href={`/?strategyId=${strategy.id}`}>
            <Button variant="secondary" size="sm" data-testid={`button-load-strategy-${strategy.id}`}>
              <TrendingUp className="w-3 h-3 mr-1" /> Optimize
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-trading-loss"
            data-testid={`button-delete-strategy-${strategy.id}`}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {completedRuns.length > 0 && (
        <div className="border-t border-border/30 px-4 py-2 bg-muted/10">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
            <BarChart3 className="w-3 h-3" />
            Recent Runs
          </div>
          <div className="space-y-1">
            {completedRuns.slice(0, 3).map((run) => {
              const tickers = (run.tickers as string[]).map(t => t.split("/")[0]).join(", ");
              const timeframes = (run.timeframes as string[]).join(", ");
              return (
                <div key={run.id} className="flex items-center justify-between text-xs" data-testid={`run-row-${run.id}`}>
                  <span className="text-muted-foreground">
                    {tickers} / {timeframes} — {new Date(run.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">
                      {run.totalConfigsTested?.toLocaleString() ?? "?"} configs
                    </Badge>
                    <Link href={`/history/${run.id}`}>
                      <Button variant="ghost" size="sm" className="h-5 px-1" data-testid={`button-view-run-${run.id}`}>
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
