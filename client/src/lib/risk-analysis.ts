import type { TradeRecord, RiskAnalysis } from "@shared/schema";

export function calculateRiskAnalysis(
  trades: TradeRecord[],
  netProfitPercent: number,
  maxDrawdownPercent: number,
  winRatePercent: number,
  equityCurve?: { time: string; equity: number }[]
): RiskAnalysis {
  const closedTrades = trades.filter(t => t.exitReason !== "Open Position");
  if (closedTrades.length === 0) {
    return getEmptyAnalysis(maxDrawdownPercent);
  }

  const wins = closedTrades.filter(t => t.pnlPercent > 0);
  const losses = closedTrades.filter(t => t.pnlPercent <= 0);

  const avgWinPercent = wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0;
  const avgLossPercent = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length) : 0;
  const worstTradePercent = closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.pnlPercent)) : 0;

  let longestLosingStreak = 0;
  let currentStreak = 0;
  for (const t of closedTrades) {
    if (t.pnlPercent <= 0) {
      currentStreak++;
      longestLosingStreak = Math.max(longestLosingStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const streakDrawdownPercent = longestLosingStreak * avgLossPercent;

  let avgBarsInDrawdown = 0;
  if (equityCurve && equityCurve.length > 1) {
    let peakEquity = equityCurve[0].equity;
    let drawdownBars = 0;
    let drawdownPeriods = 0;
    let totalDrawdownBars = 0;
    let inDrawdown = false;

    for (const pt of equityCurve) {
      if (pt.equity >= peakEquity) {
        peakEquity = pt.equity;
        if (inDrawdown) {
          totalDrawdownBars += drawdownBars;
          drawdownPeriods++;
          drawdownBars = 0;
          inDrawdown = false;
        }
      } else {
        inDrawdown = true;
        drawdownBars++;
      }
    }
    if (inDrawdown) {
      totalDrawdownBars += drawdownBars;
      drawdownPeriods++;
    }
    avgBarsInDrawdown = drawdownPeriods > 0 ? Math.round(totalDrawdownBars / drawdownPeriods) : 0;
  }

  const winRate = winRatePercent / 100;
  const lossRate = 1 - winRate;

  const kellyPercent = avgLossPercent > 0 && avgWinPercent > 0
    ? Math.max(0, (winRate * avgWinPercent - lossRate * avgLossPercent) / avgWinPercent) * 100
    : 0;

  let riskOfRuin = 0;
  if (avgWinPercent > 0 && avgLossPercent > 0 && winRate > 0 && winRate < 1) {
    const rr = avgWinPercent / avgLossPercent;
    const edgeRatio = (1 + rr) * winRate - 1;
    if (edgeRatio <= 0) {
      riskOfRuin = 100;
    } else {
      const q = lossRate / winRate;
      const bankrollUnits = 100 / avgLossPercent;
      riskOfRuin = Math.min(100, Math.max(0, Math.pow(q, bankrollUnits) * 100));
    }
  }

  const recoveryFactor = maxDrawdownPercent > 0 ? netProfitPercent / maxDrawdownPercent : 0;

  const safeLevMultiplier = 0.8;
  const maxSafeLeverage = maxDrawdownPercent > 0
    ? Math.max(1, Math.floor((100 / maxDrawdownPercent) * safeLevMultiplier))
    : 1;

  const streakSafety = streakDrawdownPercent > 0
    ? Math.max(1, Math.floor(100 / (streakDrawdownPercent * 1.5)))
    : maxSafeLeverage;

  const recommendedLeverage = Math.max(1, Math.min(maxSafeLeverage, streakSafety));

  const liquidationBuffer = maxDrawdownPercent > 0
    ? Math.round(((100 / recommendedLeverage) - maxDrawdownPercent) / (100 / recommendedLeverage) * 100)
    : 0;

  const fixedTradeSize = 1000;
  const peakDrawdownDollar = (maxDrawdownPercent / 100) * fixedTradeSize;
  const streakDrawdownDollar = (streakDrawdownPercent / 100) * fixedTradeSize;
  const worstCaseBuffer = Math.max(peakDrawdownDollar, streakDrawdownDollar) * 1.5;
  const recommendedWalletAllocation = Math.round(fixedTradeSize + worstCaseBuffer);
  const minCapitalRequired = Math.round(fixedTradeSize + peakDrawdownDollar);

  let riskRating: RiskAnalysis["riskRating"];
  if (maxDrawdownPercent <= 15 && longestLosingStreak <= 3 && recoveryFactor >= 3) {
    riskRating = "LOW";
  } else if (maxDrawdownPercent <= 35 && longestLosingStreak <= 6 && recoveryFactor >= 1.5) {
    riskRating = "MODERATE";
  } else if (maxDrawdownPercent <= 60 && recoveryFactor >= 0.5) {
    riskRating = "HIGH";
  } else {
    riskRating = "EXTREME";
  }

  const recommendations: string[] = [];

  recommendations.push(
    `Use ${recommendedLeverage}x leverage (max safe: ${maxSafeLeverage}x based on ${maxDrawdownPercent.toFixed(1)}% max drawdown)`
  );

  if (longestLosingStreak >= 4) {
    recommendations.push(
      `Strategy had ${longestLosingStreak} consecutive losses (${streakDrawdownPercent.toFixed(1)}% cumulative). Allocate extra buffer capital — do not rely on auto top-up during losing streaks.`
    );
  }

  if (recommendedLeverage <= 2) {
    recommendations.push(
      `High drawdown limits leverage to ${recommendedLeverage}x. Consider reducing position size or tightening stop losses.`
    );
  }

  recommendations.push(
    `Allocate at least $${recommendedWalletAllocation} per $1,000 trade size to survive worst-case drawdowns without wallet drainage.`
  );

  if (recoveryFactor < 1) {
    recommendations.push(
      `Recovery factor is ${recoveryFactor.toFixed(2)} (profit / drawdown). Below 1.0 means drawdowns are larger than returns — consider this strategy high risk.`
    );
  } else if (recoveryFactor >= 3) {
    recommendations.push(
      `Strong recovery factor of ${recoveryFactor.toFixed(2)} — strategy recovers well from drawdowns.`
    );
  }

  if (riskOfRuin > 20) {
    recommendations.push(
      `Risk of ruin is ${riskOfRuin.toFixed(1)}%. Use half-Kelly position sizing or smaller to protect capital.`
    );
  }

  if (kellyPercent > 0) {
    const halfKelly = kellyPercent / 2;
    recommendations.push(
      `Kelly criterion suggests ${kellyPercent.toFixed(1)}% of capital per trade. Use half-Kelly (${halfKelly.toFixed(1)}%) for safety.`
    );
  }

  if (avgBarsInDrawdown > 20) {
    recommendations.push(
      `Average drawdown lasts ${avgBarsInDrawdown} bars. Be patient — early losses are normal for this strategy.`
    );
  }

  return {
    maxDrawdownPercent: Math.round(maxDrawdownPercent * 100) / 100,
    recommendedLeverage,
    maxSafeLeverage,
    liquidationBuffer: Math.max(0, liquidationBuffer),
    consecutiveLosses: longestLosingStreak,
    longestLosingStreak,
    avgLossPercent: Math.round(avgLossPercent * 100) / 100,
    avgWinPercent: Math.round(avgWinPercent * 100) / 100,
    worstTradePercent: Math.round(worstTradePercent * 100) / 100,
    recoveryFactor: Math.round(recoveryFactor * 100) / 100,
    kellyPercent: Math.round(kellyPercent * 100) / 100,
    riskOfRuin: Math.round(riskOfRuin * 100) / 100,
    recommendedWalletAllocation,
    minCapitalRequired,
    streakDrawdownPercent: Math.round(streakDrawdownPercent * 100) / 100,
    avgBarsInDrawdown,
    riskRating,
    recommendations,
  };
}

function getEmptyAnalysis(maxDrawdownPercent: number): RiskAnalysis {
  return {
    maxDrawdownPercent,
    recommendedLeverage: 1,
    maxSafeLeverage: 1,
    liquidationBuffer: 0,
    consecutiveLosses: 0,
    longestLosingStreak: 0,
    avgLossPercent: 0,
    avgWinPercent: 0,
    worstTradePercent: 0,
    recoveryFactor: 0,
    kellyPercent: 0,
    riskOfRuin: 100,
    recommendedWalletAllocation: 0,
    minCapitalRequired: 0,
    streakDrawdownPercent: 0,
    avgBarsInDrawdown: 0,
    riskRating: "EXTREME",
    recommendations: ["Insufficient trade data for risk analysis."],
  };
}
