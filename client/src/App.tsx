import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Setup from "@/pages/Setup";
import Running from "@/pages/Running";
import Results from "@/pages/Results";
import Strategies from "@/pages/Strategies";
import HistoryResults from "@/pages/HistoryResults";
import { Zap, Code2, Settings2 } from "lucide-react";

function Header() {
  const [location] = useLocation();
  const isSetup = location === "/" || location.startsWith("/?");
  const isStrategies = location === "/strategies";

  return (
    <header className="flex items-center justify-between gap-1 px-6 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Link href="/">
          <div className="flex items-center gap-3 cursor-pointer">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
              <Zap className="w-4 h-4 text-primary" data-testid="icon-logo" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight" data-testid="text-app-title">QuantumLab</h1>
              <p className="text-xs text-muted-foreground">Strategy Backtester & Optimizer</p>
            </div>
          </div>
        </Link>
      </div>
      <div className="flex items-center gap-1">
        <Link href="/">
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isSetup ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="nav-setup"
          >
            <Settings2 className="w-3 h-3 inline mr-1" />
            Setup
          </button>
        </Link>
        <Link href="/strategies">
          <button
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isStrategies ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            data-testid="nav-strategies"
          >
            <Code2 className="w-3 h-3 inline mr-1" />
            Strategies
          </button>
        </Link>
      </div>
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Setup} />
      <Route path="/running/:jobId" component={Running} />
      <Route path="/results/:jobId" component={Results} />
      <Route path="/strategies" component={Strategies} />
      <Route path="/history/:runId" component={HistoryResults} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background flex flex-col">
          <Header />
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
