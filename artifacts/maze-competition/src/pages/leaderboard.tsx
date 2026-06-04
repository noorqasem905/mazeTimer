import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatTimeMs } from "@/lib/format";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Trophy, Activity } from "lucide-react";

type Team = { id: string; name: string };
type Run = { id: string; team_id: string; time_ms: number };
type Settings = { runs_per_team: number; ranking_mode: "best" | "average" | "total" };

type RankedTeam = {
  rank: number;
  id: string;
  name: string;
  allRuns: Run[];
  runsCount: number;
  score: number | null;
};

const rankingModeLabel = { best: "Best run", average: "Average", total: "Total time" };

export default function LeaderboardPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [settings, setSettings] = useState<Settings>({ runs_per_team: 3, ranking_mode: "best" });
  const [ranked, setRanked] = useState<RankedTeam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();

    const runsSub = supabase.channel("lb_runs").on("postgres_changes", { event: "*", schema: "public", table: "maze_runs" }, fetchData).subscribe();
    const teamsSub = supabase.channel("lb_teams").on("postgres_changes", { event: "*", schema: "public", table: "maze_teams" }, fetchData).subscribe();
    const settingsSub = supabase.channel("lb_settings").on("postgres_changes", { event: "*", schema: "public", table: "maze_settings" }, fetchData).subscribe();

    return () => {
      supabase.removeChannel(runsSub);
      supabase.removeChannel(teamsSub);
      supabase.removeChannel(settingsSub);
    };
  }, []);

  async function fetchData() {
    const [teamsRes, runsRes, settingsRes] = await Promise.all([
      supabase.from("maze_teams").select("*"),
      supabase.from("maze_runs").select("*").order("created_at"),
      supabase.from("maze_settings").select("*").eq("id", "default").single(),
    ]);

    const t: Team[] = teamsRes.data || [];
    const r: Run[] = runsRes.data || [];
    const s: Settings = settingsRes.data || { runs_per_team: 3, ranking_mode: "best" };

    setTeams(t);
    setRuns(r);
    setSettings(s);

    const computed: RankedTeam[] = t.map((team) => {
      const allRuns = r.filter((run) => run.team_id === team.id);
      const officialRuns = allRuns.slice(0, s.runs_per_team);
      const n = officialRuns.length;
      let score: number | null = null;
      if (n > 0) {
        if (s.ranking_mode === "best") score = Math.min(...officialRuns.map((x) => x.time_ms));
        else if (s.ranking_mode === "average") score = officialRuns.reduce((a, x) => a + x.time_ms, 0) / n;
        else score = officialRuns.reduce((a, x) => a + x.time_ms, 0);
      }
      return { rank: 0, id: team.id, name: team.name, allRuns, runsCount: n, score };
    });

    const sorted = computed.filter((t) => t.score !== null).sort((a, b) => (a.score as number) - (b.score as number));
    sorted.forEach((t, i) => { t.rank = i + 1; });
    setRanked(sorted);
    setLoading(false);
  }

  const medalStyle = (rank: number) => {
    if (rank === 1) return "text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]";
    if (rank === 2) return "text-slate-300 drop-shadow-[0_0_6px_rgba(209,213,219,0.5)]";
    if (rank === 3) return "text-amber-600 drop-shadow-[0_0_6px_rgba(180,83,9,0.5)]";
    return "";
  };

  const rowBg = (rank: number) =>
    rank === 1 ? "bg-yellow-500/5" : rank === 2 ? "bg-slate-500/5" : rank === 3 ? "bg-amber-700/5" : "";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-400" />
              Leaderboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Lower time wins &nbsp;·&nbsp; Scoring: {rankingModeLabel[settings.ranking_mode]} &nbsp;·&nbsp; {settings.runs_per_team} runs per team
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-green-400 font-medium bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            Live
          </div>
        </div>

        {loading ? (
          <Card className="p-16 text-center text-muted-foreground">Loading standings…</Card>
        ) : ranked.length === 0 ? (
          <Card className="p-16 text-center">
            <Trophy className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-muted-foreground">No completed runs yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Runs will appear here automatically once the ESP32 records them.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden border-border/60">
            <table className="w-full text-sm" data-testid="leaderboard-table">
              <thead>
                <tr className="border-b border-border bg-card text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 text-center w-16">Rank</th>
                  <th className="px-5 py-3 text-left">Team</th>
                  <th className="px-5 py-3 text-center hidden sm:table-cell">Runs</th>
                  <th className="px-5 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((team) => (
                  <tr
                    key={team.id}
                    className={`border-b border-border/40 transition-colors hover:bg-white/4 ${rowBg(team.rank)}`}
                    data-testid={`row-team-${team.id}`}
                  >
                    <td className="px-5 py-4 text-center">
                      {team.rank <= 3 ? (
                        <span className={`text-xl font-bold ${medalStyle(team.rank)}`}>
                          {team.rank === 1 ? "1st" : team.rank === 2 ? "2nd" : "3rd"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-medium">#{team.rank}</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className={`font-semibold text-base ${team.rank <= 3 ? "text-white" : "text-foreground"}`}>
                        {team.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                        {team.allRuns.slice(0, settings.runs_per_team).map((r, i) => (
                          <span key={r.id} className="mr-2">R{i + 1}: {(r.time_ms / 1000).toFixed(2)}s</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center hidden sm:table-cell">
                      <span className="text-muted-foreground text-sm">{team.runsCount} / {settings.runs_per_team}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-mono text-lg font-bold text-primary tabular-nums">
                        {formatTimeMs(team.score)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </Layout>
  );
}
