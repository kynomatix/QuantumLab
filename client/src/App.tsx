import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Setup from "@/pages/Setup";
import Running from "@/pages/Running";
import Results from "@/pages/Results";
import { Zap } from "lucide-react";

function Header() {
  return (
    <header className="flex items-center justify-between gap-1 px-6 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
          <Zap className="w-4 h-4 text-primary" data-testid="icon-logo" />
        </div>
        <div>
          <h1 className="text-sm font-semibold tracking-tight" data-testid="text-app-title">Flux Momentum</h1>
          <p className="text-xs text-muted-foreground">Backtester & Optimizer</p>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-mono" data-testid="text-version">v1.0</span>
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Setup} />
      <Route path="/running/:jobId" component={Running} />
      <Route path="/results/:jobId" component={Results} />
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
