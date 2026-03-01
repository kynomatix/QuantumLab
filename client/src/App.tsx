import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Setup from "@/pages/Setup";
import Running from "@/pages/Running";
import Results from "@/pages/Results";
import Strategies from "@/pages/Strategies";
import RunHistory from "@/pages/RunHistory";
import HistoryResults from "@/pages/HistoryResults";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Setup} />
      <Route path="/running/:jobId" component={Running} />
      <Route path="/results/:jobId" component={Results} />
      <Route path="/strategies" component={Strategies} />
      <Route path="/history" component={RunHistory} />
      <Route path="/history/:runId" component={HistoryResults} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <header className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-[9999]">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
              </header>
              <main className="flex-1 overflow-auto">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
