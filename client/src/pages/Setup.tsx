import { useState, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Code2, Play, Rocket, ChevronDown, Calendar, Settings2, Lock,
  TrendingUp, Gauge, BarChart3, Loader2, CheckCircle2, AlertCircle, Save,
} from "lucide-react";
import type { PineInput, PineParseResult, Strategy } from "@shared/schema";
import { AVAILABLE_TICKERS, AVAILABLE_TIMEFRAMES } from "@shared/schema";

const EXAMPLE_PINE = `// Paste your Pine Script strategy here
// The parser will extract all input.* declarations
//
// Example:
// string g_squeeze = "═══ SQUEEZE DETECTION ═══"
// int bbLen = input.int(20, "BB Length", minval=5, maxval=50, group=g_squeeze)
// float bbMult = input.float(2.0, "BB Multiplier", minval=0.5, maxval=4.0, step=0.1, group=g_squeeze)
// int kcLen = input.int(20, "KC Length", minval=5, maxval=50, group=g_squeeze)
// float kcMult = input.float(1.5, "KC Multiplier", minval=0.5, maxval=3.0, step=0.1, group=g_squeeze)
//
// Date inputs like input.time() will be detected and excluded from optimization.`;

export default function Setup() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const strategyIdParam = searchParams.get("strategyId");
  const { toast } = useToast();
  const [code, setCode] = useState(EXAMPLE_PINE);
  const [strategyName, setStrategyName] = useState("");
  const [strategyId, setStrategyId] = useState<number | null>(strategyIdParam ? parseInt(strategyIdParam) : null);
  const [parsedResult, setParsedResult] = useState<PineParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedTickers, setSelectedTickers] = useState<string[]>(["SOL/USDT:USDT"]);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(["15m"]);
  const [startDate, setStartDate] = useState("2023-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [randomSamples, setRandomSamples] = useState(900);
  const [topK, setTopK] = useState(20);
  const [refinements, setRefinements] = useState(60);
  const [minTrades, setMinTrades] = useState(10);
  const [maxDrawdown, setMaxDrawdown] = useState(85);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: loadedStrategy } = useQuery<Strategy>({
    queryKey: ["/api/strategies", strategyIdParam],
    queryFn: async () => {
      const res = await fetch(`/api/strategies/${strategyIdParam}`);
      if (!res.ok) throw new Error("Strategy not found");
      return res.json();
    },
    enabled: !!strategyIdParam,
  });

  useEffect(() => {
    if (loadedStrategy) {
      setCode(loadedStrategy.pineScript);
      setStrategyName(loadedStrategy.name);
      setStrategyId(loadedStrategy.id);
      setParsedResult({
        inputs: loadedStrategy.parsedInputs as PineInput[],
        groups: (loadedStrategy.groups as Record<string, string>) ?? {},
        strategySettings: (loadedStrategy.strategySettings as any) ?? {},
      });
    }
  }, [loadedStrategy]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!parsedResult) throw new Error("Parse first");
      const name = strategyName.trim() || "Untitled Strategy";
      const body = {
        name,
        pineScript: code,
        parsedInputs: parsedResult.inputs,
        groups: parsedResult.groups,
        strategySettings: parsedResult.strategySettings,
      };
      if (strategyId) {
        const res = await apiRequest("PATCH", `/api/strategies/${strategyId}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/strategies", body);
        return res.json();
      }
    },
    onSuccess: (strategy: Strategy) => {
      setStrategyId(strategy.id);
      setStrategyName(strategy.name);
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      toast({ title: strategyId ? "Strategy updated" : "Strategy saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const handleParse = useCallback(async () => {
    if (!code.trim() || code === EXAMPLE_PINE) {
      toast({ title: "Please paste your Pine Script code first", variant: "destructive" });
      return;
    }
    setIsParsing(true);
    setParseError(null);
    try {
      const res = await apiRequest("POST", "/api/parse-pine", { code });
      const result = await res.json();
      setParsedResult(result);
      if (result.inputs.length === 0) {
        setParseError("No input declarations found. Make sure your script uses input.int(), input.float(), etc.");
      } else {
        toast({ title: `Found ${result.inputs.length} parameters across ${Object.keys(result.groups).length} groups` });
      }
    } catch (err: any) {
      setParseError(err.message);
      toast({ title: "Failed to parse script", description: err.message, variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  }, [code, toast]);

  const toggleTicker = (symbol: string) => {
    setSelectedTickers(prev =>
      prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]
    );
  };

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes(prev =>
      prev.includes(tf) ? prev.filter(t => t !== tf) : [...prev, tf]
    );
  };

  const handleRun = async (mode: "smoke" | "sweep") => {
    if (!parsedResult || parsedResult.inputs.length === 0) {
      toast({ title: "Parse your Pine Script first", variant: "destructive" });
      return;
    }
    if (selectedTickers.length === 0) {
      toast({ title: "Select at least one ticker", variant: "destructive" });
      return;
    }
    if (selectedTimeframes.length === 0) {
      toast({ title: "Select at least one timeframe", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const tickers = mode === "smoke" ? [selectedTickers[0]] : selectedTickers;
      const timeframes = mode === "smoke" ? [selectedTimeframes[0]] : selectedTimeframes;
      const samples = mode === "smoke" ? Math.min(100, randomSamples) : randomSamples;
      const top = mode === "smoke" ? Math.min(5, topK) : topK;
      const refs = mode === "smoke" ? Math.min(20, refinements) : refinements;

      const res = await apiRequest("POST", "/api/run-optimization", {
        pineScript: code,
        parsedInputs: parsedResult.inputs,
        tickers,
        timeframes,
        startDate,
        endDate,
        randomSamples: samples,
        topK: top,
        refinementsPerSeed: refs,
        minTrades,
        maxDrawdownCap: maxDrawdown,
        mode,
        strategyId: strategyId ?? undefined,
      });
      const { jobId } = await res.json();
      navigate(`/running/${jobId}`);
    } catch (err: any) {
      toast({ title: "Failed to start optimization", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const optimizableCount = parsedResult?.inputs.filter(i => i.optimizable).length ?? 0;
  const fixedCount = parsedResult?.inputs.filter(i => !i.optimizable).length ?? 0;

  const groupedInputs = parsedResult ? groupByCategory(parsedResult.inputs) : {};

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-1 px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
                <Input
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  placeholder="Strategy name..."
                  className="h-7 text-sm border-none bg-transparent px-1 max-w-[200px]"
                  data-testid="input-strategy-name"
                />
              </div>
              <div className="flex items-center gap-2">
                {parsedResult && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-strategy"
                  >
                    {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                    {strategyId ? "Update" : "Save"}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleParse}
                  disabled={isParsing}
                  data-testid="button-parse"
                >
                  {isParsing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                  {isParsing ? "Parsing..." : "Parse Script"}
                </Button>
              </div>
            </div>
            <div className="h-[400px]">
              <Editor
                height="100%"
                defaultLanguage="javascript"
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  padding: { top: 12, bottom: 12 },
                  renderLineHighlight: "none",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                data-testid="editor-pine-script"
              />
            </div>
          </Card>

          {parseError && (
            <Card className="p-4 border-trading-loss/30 bg-trading-loss/5">
              <div className="flex items-center gap-2 text-trading-loss">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm" data-testid="text-parse-error">{parseError}</span>
              </div>
            </Card>
          )}

          {parsedResult && parsedResult.inputs.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-1 px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Parsed Parameters</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" data-testid="badge-optimizable-count">
                    {optimizableCount} optimizable
                  </Badge>
                  {fixedCount > 0 && (
                    <Badge variant="outline" data-testid="badge-fixed-count">
                      <Lock className="w-3 h-3 mr-1" />
                      {fixedCount} fixed
                    </Badge>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-4 max-h-[400px] overflow-auto">
                {Object.entries(groupedInputs).map(([group, inputs]) => (
                  <div key={group}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2" data-testid={`text-group-${group}`}>
                      {group}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {inputs.map((input: PineInput) => (
                        <div
                          key={input.name}
                          className={`flex items-center justify-between gap-1 p-2.5 rounded-md text-sm ${
                            input.optimizable
                              ? "bg-muted/30 border border-border/30"
                              : "bg-trading-warning/5 border border-trading-warning/20"
                          }`}
                          data-testid={`param-${input.name}`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs text-foreground">{input.name}</span>
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {input.type}
                              </Badge>
                              {!input.optimizable && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Lock className="w-3 h-3 text-trading-warning" />
                                  </TooltipTrigger>
                                  <TooltipContent>Not optimized - fixed parameter</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{input.label}</p>
                          </div>
                          <div className="text-right text-xs flex-shrink-0">
                            <div className="font-mono text-foreground">{String(input.default)}</div>
                            {input.optimizable && (input.type === "int" || input.type === "float") && (
                              <div className="text-[10px] text-muted-foreground">
                                {input.min} - {input.max}
                              </div>
                            )}
                            {input.optimizable && input.options && (
                              <div className="text-[10px] text-muted-foreground">
                                {input.options.length} options
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-4 space-y-5">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
                Tickers
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_TICKERS.map((t) => (
                  <button
                    key={t.symbol}
                    onClick={() => toggleTicker(t.symbol)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover-elevate ${
                      selectedTickers.includes(t.symbol)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground border border-border/50"
                    }`}
                    data-testid={`button-ticker-${t.name}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
                Timeframes
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => toggleTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover-elevate ${
                      selectedTimeframes.includes(tf)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground border border-border/50"
                    }`}
                    data-testid={`button-tf-${tf}`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 block">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Date Range
                </div>
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-[11px] text-muted-foreground mb-1 block">Start</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="text-xs font-mono"
                    data-testid="input-start-date"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-[11px] text-muted-foreground mb-1 block">End</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="text-xs font-mono"
                    data-testid="input-end-date"
                  />
                </div>
              </div>
              <p className="text-[10px] text-trading-warning/70 mt-2 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Date range is fixed and never optimized
              </p>
            </div>

            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs text-muted-foreground w-full py-1 hover-elevate rounded-md px-2" data-testid="button-advanced-toggle">
                  <ChevronDown className={`w-3 h-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                  Advanced Settings
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Random Samples</Label>
                    <Input
                      type="number"
                      value={randomSamples}
                      onChange={(e) => setRandomSamples(Number(e.target.value))}
                      className="text-xs font-mono"
                      data-testid="input-random-samples"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Top K Seeds</Label>
                    <Input
                      type="number"
                      value={topK}
                      onChange={(e) => setTopK(Number(e.target.value))}
                      className="text-xs font-mono"
                      data-testid="input-top-k"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Refinements/Seed</Label>
                    <Input
                      type="number"
                      value={refinements}
                      onChange={(e) => setRefinements(Number(e.target.value))}
                      className="text-xs font-mono"
                      data-testid="input-refinements"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground mb-1 block">Min Trades</Label>
                    <Input
                      type="number"
                      value={minTrades}
                      onChange={(e) => setMinTrades(Number(e.target.value))}
                      className="text-xs font-mono"
                      data-testid="input-min-trades"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">Max Drawdown Cap (%)</Label>
                  <Input
                    type="number"
                    value={maxDrawdown}
                    onChange={(e) => setMaxDrawdown(Number(e.target.value))}
                    className="text-xs font-mono"
                    data-testid="input-max-drawdown"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="space-y-2 pt-2">
              <Button
                className="w-full bg-trading-profit text-white border-none"
                onClick={() => handleRun("smoke")}
                disabled={isSubmitting || !parsedResult}
                data-testid="button-smoke-test"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Run Smoke Test
              </Button>
              <Button
                className="w-full"
                variant="default"
                onClick={() => handleRun("sweep")}
                disabled={isSubmitting || !parsedResult}
                data-testid="button-full-sweep"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Rocket className="w-4 h-4 mr-2" />
                )}
                Run Full Sweep
              </Button>
              {parsedResult && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {selectedTickers.length} ticker{selectedTickers.length !== 1 ? "s" : ""} x {selectedTimeframes.length} timeframe{selectedTimeframes.length !== 1 ? "s" : ""} = {selectedTickers.length * selectedTimeframes.length} combo{selectedTickers.length * selectedTimeframes.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick Stats</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Parameters</span>
                <span className="font-mono" data-testid="text-param-count">{parsedResult?.inputs.length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5"><Gauge className="w-3 h-3" /> Optimizable</span>
                <span className="font-mono text-trading-profit" data-testid="text-optimizable">{optimizableCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5"><Lock className="w-3 h-3" /> Fixed</span>
                <span className="font-mono text-trading-warning" data-testid="text-fixed">{fixedCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> Est. Configs</span>
                <span className="font-mono" data-testid="text-est-configs">
                  {((randomSamples + topK * refinements) * selectedTickers.length * selectedTimeframes.length).toLocaleString()}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function groupByCategory(inputs: PineInput[]): Record<string, PineInput[]> {
  const groups: Record<string, PineInput[]> = {};
  const fixedInputs = inputs.filter(i => !i.optimizable);
  const optimizableInputs = inputs.filter(i => i.optimizable);

  for (const input of optimizableInputs) {
    const group = input.groupLabel || input.group || "General";
    if (!groups[group]) groups[group] = [];
    groups[group].push(input);
  }

  if (fixedInputs.length > 0) {
    groups["Fixed Parameters (Not Optimized)"] = fixedInputs;
  }

  return groups;
}
