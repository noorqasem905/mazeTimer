import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import TimerPage from "@/pages/timer";
import LeaderboardPage from "@/pages/leaderboard";
import AdminPage from "@/pages/admin";
import TeamsBulkAddPage from "@/pages/teams";
import ParticipantsPage from "@/pages/participants";
import OrganizersPage from "@/pages/organizers";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={TimerPage} />
      <Route path="/leaderboard" component={LeaderboardPage} />
      <Route path="/participants" component={ParticipantsPage} />
      <Route path="/organizers" component={OrganizersPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/teams" component={TeamsBulkAddPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
