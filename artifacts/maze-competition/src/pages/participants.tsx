import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { formatTimeMs } from "@/lib/format";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Users, Trophy, Hash } from "lucide-react";

type Team   = { id: string; team_number: number; name: string };
type Member = { id: string; team_id: string; name: string };
type Run    = { id: string; team_id: string; time_ms: number };
type Settings = { runs_per_team: number; ranking_mode: "best" | "average" | "total" };

function bestScore(runs: Run[], mode: Settings["ranking_mode"], limit: number): number | null {
  const official = runs.slice(0, limit);
  if (!official.length) return null;
  if (mode === "best")    return Math.min(...official.map(r => r.time_ms));
  if (mode === "average") return official.reduce((a, r) => a + r.time_ms, 0) / official.length;
  return official.reduce((a, r) => a + r.time_ms, 0);
}

export default function ParticipantsPage() {
  const [teams,    setTeams]    = useState<Team[]>([]);
  const [members,  setMembers]  = useState<Member[]>([]);
  const [runs,     setRuns]     = useState<Run[]>([]);
  const [settings, setSettings] = useState<Settings>({ runs_per_team: 3, ranking_mode: "best" });
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [tRes, mRes, rRes, sRes] = await Promise.all([
      supabase.from("maze_teams").select("*").order("team_number"),
      supabase.from("maze_team_members").select("*"),
      supabase.from("maze_runs").select("*").order("created_at"),
      supabase.from("maze_settings").select("*").eq("id", "default").single(),
    ]);

    if (mRes.error) {
      const isTableMissing = mRes.error.message?.toLowerCase().includes("schema cache") || mRes.error.code === "42P01" || mRes.error.code === "PGRST106";
      if (isTableMissing) {
        setError("The maze_team_members table doesn't exist yet. Go to your Supabase dashboard → SQL Editor and run the file esp32/supabase_new_tables.sql.");
      }
    }

    setTeams(tRes.data   || []);
    setMembers(mRes.data || []);
    setRuns(rRes.data    || []);
    if (sRes.data) setSettings(sRes.data as Settings);
    setLoading(false);
  }

  const teamMembers  = (id: string) => members.filter(m => m.team_id === id);
  const teamRuns     = (id: string) => runs.filter(r => r.team_id === id);
  const teamScore    = (id: string) => bestScore(teamRuns(id), settings.ranking_mode, settings.runs_per_team);

  const rankedTeams = [...teams].sort((a, b) => {
    const sa = teamScore(a.id), sb = teamScore(b.id);
    if (sa === null && sb === null) return 0;
    if (sa === null) return 1;
    if (sb === null) return -1;
    return sa - sb;
  });

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            Competition Teams
          </h1>
          <p className="text-muted-foreground mt-1">
            All registered teams and their members — {teams.length} teams total
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-muted-foreground py-20">Loading teams…</div>
        ) : teams.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p>No teams registered yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {rankedTeams.map((team, idx) => {
              const score   = teamScore(team.id);
              const members = teamMembers(team.id);
              const runs    = teamRuns(team.id);
              const rank    = score !== null ? idx + 1 : null;

              return (
                <Card
                  key={team.id}
                  className={`p-5 flex flex-col gap-4 border transition-all hover:scale-[1.01] hover:shadow-lg ${
                    rank === 1 ? "border-yellow-500/40 bg-yellow-500/5" :
                    rank === 2 ? "border-slate-400/30 bg-slate-500/5"  :
                    rank === 3 ? "border-amber-700/30 bg-amber-700/5"  :
                    "border-border"
                  }`}
                  data-testid={`card-team-${team.id}`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                        <Hash className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-bold text-base text-white leading-tight">{team.name}</h2>
                        <p className="text-xs text-muted-foreground">Team #{team.team_number}</p>
                      </div>
                    </div>
                    {rank !== null && (
                      <span className={`text-sm font-bold shrink-0 ${
                        rank === 1 ? "text-yellow-400" :
                        rank === 2 ? "text-slate-300"  :
                        rank === 3 ? "text-amber-600"  :
                        "text-muted-foreground"
                      }`}>
                        {rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `#${rank}`}
                      </span>
                    )}
                  </div>

                  {/* Members */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Members
                    </p>
                    {members.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No members listed yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {members.map(m => (
                          <span
                            key={m.id}
                            className="text-xs bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full font-medium"
                          >
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Trophy className="h-3.5 w-3.5" />
                      <span>{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="text-right">
                      {score !== null ? (
                        <>
                          <p className="font-mono font-bold text-lg text-primary tabular-nums leading-none">
                            {formatTimeMs(score)}
                          </p>
                          <p className="text-[10px] text-muted-foreground capitalize">{settings.ranking_mode}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No score yet</p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
