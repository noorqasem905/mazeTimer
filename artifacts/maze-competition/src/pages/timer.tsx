import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatStopwatch } from "@/lib/format";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";

type EventLog = {
  id: string;
  time: string;
  team: string;
  status: string;
  ms: number | null;
};

export default function TimerPage() {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>("No active team");
  const [status, setStatus] = useState<"READY" | "STARTED" | "FINISHED" | "ERROR">("READY");
  const [elapsed, setElapsed] = useState<number>(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [logs, setLogs] = useState<EventLog[]>([]);

  useEffect(() => {
    fetchSettings();

    const settingsSub = supabase
      .channel("timer_settings")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "maze_settings" }, () => {
        fetchSettings();
      })
      .subscribe();

    const eventsSub = supabase
      .channel("timer_events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "maze_events" }, (payload) => {
        handleEvent(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(settingsSub);
      supabase.removeChannel(eventsSub);
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "STARTED" && startTime) {
      interval = setInterval(() => {
        setElapsed(Date.now() - startTime);
      }, 10);
    }
    return () => clearInterval(interval);
  }, [status, startTime]);

  async function fetchSettings() {
    const { data: settings } = await supabase.from("maze_settings").select("*").eq("id", "default").single();
    if (settings) {
      setActiveTeamId(settings.active_team_id);
      if (settings.active_team_id) {
        const { data: team } = await supabase.from("maze_teams").select("name").eq("id", settings.active_team_id).single();
        if (team) setTeamName(team.name);
      } else {
        setTeamName("No active team");
        setStatus("READY");
        setElapsed(0);
      }
    }
  }

  function handleEvent(event: any) {
    // ERROR events are remote resets — always let them through regardless of team.
    // For all other events, ignore if they belong to a different active team.
    const isReset = event.status === "ERROR" || event.status === "READY";
    if (!isReset && activeTeamId && event.team_id !== activeTeamId) return;

    if (event.team_name) setTeamName(event.team_name);

    if (event.status === "STARTED") {
      setStatus("STARTED");
      setStartTime(Date.now());
      setElapsed(0);
    } else if (event.status === "FINISHED" && event.time_ms) {
      setStatus("FINISHED");
      setElapsed(event.time_ms);
    } else {
      // READY or ERROR (remote reset) — both bring the timer back to idle.
      setStatus("READY");
      setElapsed(0);
      setStartTime(null);
    }

    setLogs((prev) =>
      [
        {
          id: String(event.id),
          time: new Date().toLocaleTimeString(),
          team: event.team_name || "Unknown",
          status: event.status,
          ms: event.time_ms ?? null,
        },
        ...prev,
      ].slice(0, 6)
    );
  }

  const cardGlow =
    status === "STARTED"
      ? "border-green-500 shadow-[0_0_40px_rgba(0,230,118,0.2)]"
      : status === "FINISHED"
      ? "border-cyan-400 shadow-[0_0_40px_rgba(0,229,255,0.2)]"
      : status === "ERROR"
      ? "border-red-500 shadow-[0_0_40px_rgba(255,23,68,0.2)]"
      : "border-border";

  const dotColor =
    status === "STARTED"
      ? "bg-green-400 animate-pulse shadow-[0_0_10px_#00e676]"
      : status === "FINISHED"
      ? "bg-cyan-400 shadow-[0_0_10px_#00e5ff]"
      : status === "ERROR"
      ? "bg-red-500 animate-pulse"
      : "bg-slate-500";

  const statusLabel =
    status === "STARTED"
      ? "Running"
      : status === "FINISHED"
      ? "Finished"
      : status === "ERROR"
      ? "Error"
      : activeTeamId
      ? "Waiting for sensor"
      : "No team selected";

  const statusBadgeColor =
    status === "STARTED"
      ? "bg-green-500/15 text-green-400 border border-green-500/30"
      : status === "FINISHED"
      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
      : status === "ERROR"
      ? "bg-red-500/15 text-red-400 border border-red-500/30"
      : "bg-white/5 text-slate-400 border border-white/10";

  const logBadge = (s: string) => {
    if (s === "STARTED") return "bg-green-500/15 text-green-400";
    if (s === "FINISHED") return "bg-cyan-500/15 text-cyan-400";
    if (s === "ERROR") return "bg-red-500/15 text-red-400";
    return "bg-white/5 text-slate-400";
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Live Timer</h1>
            <p className="text-sm text-muted-foreground mt-0.5">ESP32 real-time sensor feed</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchSettings} data-testid="button-refresh">
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>

        <Card className={`p-8 md:p-14 flex flex-col items-center justify-center transition-all duration-500 bg-black/40 border-2 ${cardGlow}`}>
          <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-widest">
            Current Team
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-8">
            {teamName}
          </h2>

          <div
            className="font-mono text-6xl md:text-8xl font-bold tracking-tighter tabular-nums text-white my-2"
            data-testid="timer-display"
          >
            {formatStopwatch(elapsed)}
          </div>

          <div className={`flex items-center gap-2.5 mt-8 px-5 py-2.5 rounded-full text-sm font-semibold ${statusBadgeColor}`}>
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
            {statusLabel}
          </div>
        </Card>

        <div className="mt-8">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 pb-2 border-b border-border">
            Recent Events
          </h3>
          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">No events yet</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg text-sm"
                  data-testid={`log-entry-${log.id}`}
                >
                  <span className="text-muted-foreground text-xs w-20 shrink-0">{log.time}</span>
                  <span className="flex-1 font-medium text-foreground truncate">{log.team}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${logBadge(log.status)}`}>
                    {log.status}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground w-16 text-right">
                    {log.ms ? `${(log.ms / 1000).toFixed(2)}s` : "—"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
