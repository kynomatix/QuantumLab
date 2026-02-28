import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield, AlertTriangle, TrendingDown, DollarSign,
  Gauge, Target, Flame, Info,
} from "lucide-react";
import type { RiskAnalysis } from "@shared/schema";

interface RiskManagementPanelProps {
  analysis: RiskAnalysis;
  ticker?: string;
  timeframe?: string;
}

const ratingColors: Record<RiskAnalysis["riskRating"], { text: string; bg: string; border: string }> = {
  LOW: { text: "text-trading-profit", bg: "bg-trading-profit/10", border: "border-trading-profit/30" },
  MODERATE: { text: "text-trading-info", bg: "bg-trading-info/10", border: "border-trading-info/30" },
  HIGH: { text: "text-trading-warning", bg: "bg-trading-warning/10", border: "border-trading-warning/30" },
  EXTREME: { text: "text-trading-loss", bg: "bg-trading-loss/10", border: "border-trading-loss/30" },
};

export default function RiskManagementPanel({ analysis, ticker, timeframe }: RiskManagementPanelProps) {
  const rc = ratingColors[analysis.riskRating];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Risk Management
          {ticker && <span className="text-muted-foreground font-normal">- {ticker.split("/")[0]} {timeframe}</span>}
        </h3>
        <Badge className={`${rc.bg} ${rc.text} ${rc.border} border text-xs font-semibold`} data-testid="badge-risk-rating">
          {analysis.riskRating} RISK
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Recommended Leverage"
          value={`${analysis.recommendedLeverage}x`}
          sublabel={`Max safe: ${analysis.maxSafeLeverage}x`}
          icon={<Gauge className="w-4 h-4" />}
          color={analysis.recommendedLeverage <= 3 ? "text-trading-profit" : analysis.recommendedLeverage <= 7 ? "text-trading-warning" : "text-trading-loss"}
          testId="metric-leverage"
        />
        <MetricCard
          label="Wallet Allocation"
          value={`$${analysis.recommendedWalletAllocation.toLocaleString()}`}
          sublabel="per $1,000 trade"
          icon={<DollarSign className="w-4 h-4" />}
          color="text-primary"
          testId="metric-wallet"
        />
        <MetricCard
          label="Longest Losing Streak"
          value={`${analysis.longestLosingStreak} trades`}
          sublabel={`${analysis.streakDrawdownPercent.toFixed(1)}% cumulative loss`}
          icon={<TrendingDown className="w-4 h-4" />}
          color={analysis.longestLosingStreak <= 3 ? "text-trading-profit" : analysis.longestLosingStreak <= 6 ? "text-trading-warning" : "text-trading-loss"}
          testId="metric-streak"
        />
        <MetricCard
          label="Recovery Factor"
          value={analysis.recoveryFactor.toFixed(2)}
          sublabel="profit / max drawdown"
          icon={<Target className="w-4 h-4" />}
          color={analysis.recoveryFactor >= 2 ? "text-trading-profit" : analysis.recoveryFactor >= 1 ? "text-trading-warning" : "text-trading-loss"}
          testId="metric-recovery"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            Position Sizing
          </h4>
          <div className="space-y-2">
            <DetailRow label="Recommended Leverage" value={`${analysis.recommendedLeverage}x`} highlight />
            <DetailRow label="Max Safe Leverage" value={`${analysis.maxSafeLeverage}x`} />
            <DetailRow label="Liquidation Buffer" value={`${analysis.liquidationBuffer}%`} />
            <DetailRow label="Kelly Criterion" value={`${analysis.kellyPercent.toFixed(1)}%`} />
            <DetailRow label="Half-Kelly (safer)" value={`${(analysis.kellyPercent / 2).toFixed(1)}%`} highlight />
            <DetailRow label="Min Capital Required" value={`$${analysis.minCapitalRequired.toLocaleString()}`} />
            <DetailRow label="Recommended Wallet" value={`$${analysis.recommendedWalletAllocation.toLocaleString()}`} highlight />
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" />
            Risk Metrics
          </h4>
          <div className="space-y-2">
            <DetailRow label="Max Drawdown" value={`${analysis.maxDrawdownPercent.toFixed(1)}%`} color="text-trading-loss" />
            <DetailRow label="Worst Single Trade" value={`${analysis.worstTradePercent.toFixed(2)}%`} color="text-trading-loss" />
            <DetailRow label="Avg Win" value={`+${analysis.avgWinPercent.toFixed(2)}%`} color="text-trading-profit" />
            <DetailRow label="Avg Loss" value={`-${analysis.avgLossPercent.toFixed(2)}%`} color="text-trading-loss" />
            <DetailRow label="Longest Losing Streak" value={`${analysis.longestLosingStreak} trades`} />
            <DetailRow label="Streak Cumulative Loss" value={`${analysis.streakDrawdownPercent.toFixed(1)}%`} />
            <DetailRow label="Risk of Ruin" value={`${analysis.riskOfRuin.toFixed(1)}%`} color={analysis.riskOfRuin > 20 ? "text-trading-loss" : analysis.riskOfRuin > 5 ? "text-trading-warning" : "text-trading-profit"} />
            {analysis.avgBarsInDrawdown > 0 && (
              <DetailRow label="Avg Drawdown Duration" value={`${analysis.avgBarsInDrawdown} bars`} />
            )}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          Deployment Recommendations
        </h4>
        <div className="space-y-2.5">
          {analysis.recommendations.map((rec, idx) => (
            <div key={idx} className="flex gap-2.5 text-xs" data-testid={`recommendation-${idx}`}>
              <div className="mt-0.5 shrink-0">
                {idx === 0 ? (
                  <Gauge className="w-3.5 h-3.5 text-primary" />
                ) : rec.includes("consecutive") || rec.includes("ruin") ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-trading-warning" />
                ) : rec.includes("Strong") || rec.includes("Kelly") ? (
                  <Target className="w-3.5 h-3.5 text-trading-profit" />
                ) : (
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed">{rec}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, sublabel, icon, color, testId }: {
  label: string; value: string; sublabel: string; icon: any; color: string; testId: string;
}) {
  return (
    <Card className="p-3">
      <div className={`mb-1.5 ${color}`}>{icon}</div>
      <p className={`text-lg font-bold font-mono ${color}`} data-testid={testId}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      <p className="text-[9px] text-muted-foreground/60">{sublabel}</p>
    </Card>
  );
}

function DetailRow({ label, value, highlight, color }: {
  label: string; value: string; highlight?: boolean; color?: string;
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded text-xs ${highlight ? "bg-muted/20" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-medium ${color || "text-foreground"}`}>{value}</span>
    </div>
  );
}
