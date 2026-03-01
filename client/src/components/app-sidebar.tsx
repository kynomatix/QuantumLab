import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap, Settings2, Code2, History, TrendingUp,
  Clock, CheckCircle2, Activity, ChevronRight, Loader2,
} from "lucide-react";
import type { Strategy, OptimizationRun } from "@shared/schema";

export function AppSidebar() {
  const [location] = useLocation();

  const { data: strategies } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const { data: recentRuns } = useQuery<OptimizationRun[]>({
    queryKey: ["/api/runs"],
    refetchInterval: 10000,
  });

  const runningRuns = recentRuns?.filter(r => r.status === "running") ?? [];
  const completedRuns = recentRuns?.filter(r => r.status === "complete") ?? [];
  const latestRuns = [...runningRuns, ...completedRuns].slice(0, 8);

  const isActive = (path: string) => {
    if (path === "/") return location === "/" || location.startsWith("/?");
    return location.startsWith(path);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/">
          <div className="flex items-center gap-3 px-2 py-1 cursor-pointer flex-wrap" data-testid="link-home">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
              <Zap className="w-4 h-4 text-primary" data-testid="icon-logo" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight" data-testid="text-app-title">QuantumLab</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">Strategy Backtester</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={isActive("/")}
                  data-testid="nav-setup"
                >
                  <Link href="/">
                    <Settings2 className="w-4 h-4" />
                    <span>Setup & Run</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={isActive("/strategies")}
                  data-testid="nav-strategies"
                >
                  <Link href="/strategies">
                    <Code2 className="w-4 h-4" />
                    <span>Strategy Library</span>
                    {strategies && strategies.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 no-default-active-elevate">
                        {strategies.length}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={isActive("/history")}
                  data-testid="nav-history"
                >
                  <Link href="/history">
                    <History className="w-4 h-4" />
                    <span>Run History</span>
                    {completedRuns.length > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 no-default-active-elevate">
                        {completedRuns.length}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Recent Runs</SidebarGroupLabel>
          <SidebarGroupContent>
            {latestRuns.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                No completed runs yet
              </p>
            ) : (
              <SidebarMenu>
                {latestRuns.map((run) => {
                  const tickers = (run.tickers as string[]).map(t => t.split("/")[0]).join(", ");
                  const tfs = (run.timeframes as string[]).join(", ");
                  const isRunning = run.status === "running";
                  const isRunActive = location === `/history/${run.id}`;
                  return (
                    <SidebarMenuItem key={run.id}>
                      <SidebarMenuButton
                        asChild
                        data-active={isRunActive}
                        data-testid={`nav-run-${run.id}`}
                      >
                        <Link href={`/history/${run.id}`}>
                          {isRunning ? (
                            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-trading-profit flex-shrink-0" />
                          )}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-xs truncate">
                              {tickers}
                              {isRunning && <span className="text-primary ml-1">(running)</span>}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate">
                              {tfs} — {new Date(run.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Strategies</SidebarGroupLabel>
          <SidebarGroupContent>
            {(!strategies || strategies.length === 0) ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                No strategies saved
              </p>
            ) : (
              <SidebarMenu>
                {strategies.slice(0, 10).map((strategy) => (
                  <SidebarMenuItem key={strategy.id}>
                    <SidebarMenuButton
                      asChild
                      data-active={location === `/?strategyId=${strategy.id}`}
                      data-testid={`nav-strategy-${strategy.id}`}
                    >
                      <Link href={`/?strategyId=${strategy.id}`}>
                        <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="text-xs truncate">{strategy.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-3 py-2">
          <p className="text-[10px] text-muted-foreground text-center">
            Companion to myquantumvault.com
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
