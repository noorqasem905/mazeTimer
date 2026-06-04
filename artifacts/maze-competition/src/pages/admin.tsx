import { useState, useEffect } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { Layout } from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldAlert, Trash2, LogOut, CheckCircle, Users,
  AlertTriangle, Zap, UserPlus, Shield, Plus, X
} from "lucide-react";
import { formatTimeMs } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

type Team      = { id: string; team_number: number; name: string };
type Run       = { id: string; team_id: string; time_ms: number; source: string };
type Member    = { id: string; team_id: string; name: string };
type Organizer = { id: string; name: string; role: string; image_url: string | null; display_order: number };

export default function AdminPage() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email,   setEmail]   = useState("");
  const [password,setPassword]= useState("");

  const [teams,      setTeams]      = useState<Team[]>([]);
  const [runs,       setRuns]       = useState<Run[]>([]);
  const [members,    setMembers]    = useState<Member[]>([]);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [settings,   setSettings]   = useState<any>({ runs_per_team: 3, ranking_mode: "best", active_team_id: null });
  const [events,     setEvents]     = useState<any[]>([]);

  // Add-team form
  const [newTeamName,   setNewTeamName]   = useState("");
  const [backupTeamId,  setBackupTeamId]  = useState("");
  const [backupTimeSec, setBackupTimeSec] = useState("");

  // Add-member form
  const [memberTeamId,  setMemberTeamId]  = useState("");
  const [memberName,    setMemberName]    = useState("");

  // Add-organizer form
  const [orgName,     setOrgName]     = useState("");
  const [orgRole,     setOrgRole]     = useState("");
  const [orgImageUrl, setOrgImageUrl] = useState("");
  const [orgOrder,    setOrgOrder]    = useState(0);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkAdmin(session.user.id); else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) checkAdmin(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function checkAdmin(userId: string) {
    const { data } = await supabase.from("maze_admins").select("*").eq("user_id", userId).single();
    if (!data) {
      toast({ title: "Access denied", description: "Not an admin account.", variant: "destructive" });
      supabase.auth.signOut();
    } else {
      fetchAll();
    }
    setLoading(false);
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { toast({ title: "Login failed", description: error.message, variant: "destructive" }); setLoading(false); }
  };

  // ── Data fetching ────────────────────────────────────────────────────────────
  async function fetchAll() {
    const [tRes, rRes, sRes, eRes, mRes, oRes] = await Promise.all([
      supabase.from("maze_teams").select("*").order("created_at", { ascending: true }),
      supabase.from("maze_runs").select("*"),
      supabase.from("maze_settings").select("*").eq("id", "default").single(),
      supabase.from("maze_events").select("*").order("created_at", { ascending: false }).limit(12),
      supabase.from("maze_team_members").select("*"),
      supabase.from("maze_organizers").select("*").order("display_order"),
    ]);
    if (tRes.data) setTeams(tRes.data);
    if (rRes.data) setRuns(rRes.data);
    if (sRes.data) setSettings(sRes.data);
    if (eRes.data) setEvents(eRes.data);
    if (mRes.data) setMembers(mRes.data);
    if (oRes.data) setOrganizers(oRes.data);
  }

  useEffect(() => {
    if (!session) return;
    const sub = supabase.channel("admin_events")
      .on("postgres_changes", { event: "*", schema: "public", table: "maze_events" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [session]);

  // ── Settings ─────────────────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    await supabase.from("maze_settings").update({
      runs_per_team: settings.runs_per_team,
      ranking_mode: settings.ranking_mode,
      active_team_id: settings.active_team_id || null,
    }).eq("id", "default");
    toast({ title: "Settings saved" });
    fetchAll();
  };

  // ── Teams ────────────────────────────────────────────────────────────────────
  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    await supabase.from("maze_teams").insert({ name: newTeamName.trim() });
    setNewTeamName("");
    toast({ title: "Team registered", description: `"${newTeamName.trim()}" added.` });
    fetchAll();
  };

  const handleDeleteTeam = async (id: string) => {
    if (!confirm("Delete this team and all their runs?")) return;
    await supabase.from("maze_teams").delete().eq("id", id);
    toast({ title: "Team deleted" });
    fetchAll();
  };

  const handleDeleteRun = async (id: string) => {
    if (!confirm("Delete this run?")) return;
    await supabase.from("maze_runs").delete().eq("id", id);
    toast({ title: "Run deleted" });
    fetchAll();
  };

  // ── Manual run ───────────────────────────────────────────────────────────────
  const handleManualBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupTeamId || !backupTimeSec) return;
    await supabase.from("maze_runs").insert({ team_id: backupTeamId, time_ms: Math.floor(parseFloat(backupTimeSec) * 1000), source: "manual" });
    setBackupTimeSec("");
    toast({ title: "Manual run saved" });
    fetchAll();
  };

  // ── Danger ───────────────────────────────────────────────────────────────────
  const handleEmergencyReset = async () => {
    if (!confirm("Send an emergency reset signal to the ESP32?")) return;
    await supabase.from("maze_events").insert({
      team_id: settings.active_team_id || null,
      team_name: teams.find(t => t.id === settings.active_team_id)?.name || "System",
      status: "ERROR",
      message: "REMOTE_RESET_TRIGGERED",
      time_ms: 0,
    });
    toast({ title: "Reset signal sent", variant: "destructive" });
  };

  const handleClearRuns = async () => {
    if (!confirm("Permanently delete ALL run records for every team?")) return;
    await supabase.from("maze_runs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    toast({ title: "All runs cleared", variant: "destructive" });
    fetchAll();
  };

  // ── Team members ─────────────────────────────────────────────────────────────
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberTeamId || !memberName.trim()) return;
    const { error } = await supabase.from("maze_team_members").insert({ team_id: memberTeamId, name: memberName.trim() });
    if (error) { toast({ title: "Error", description: error.code === "42P01" ? "Run supabase_new_tables.sql first." : error.message, variant: "destructive" }); return; }
    setMemberName("");
    toast({ title: "Member added" });
    fetchAll();
  };

  const handleDeleteMember = async (id: string) => {
    await supabase.from("maze_team_members").delete().eq("id", id);
    toast({ title: "Member removed" });
    fetchAll();
  };

  // ── Organizers ───────────────────────────────────────────────────────────────
  const handleAddOrganizer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !orgRole.trim()) return;
    const { error } = await supabase.from("maze_organizers").insert({
      name: orgName.trim(), role: orgRole.trim(),
      image_url: orgImageUrl.trim() || null, display_order: orgOrder,
    });
    if (error) { toast({ title: "Error", description: error.code === "42P01" ? "Run supabase_new_tables.sql first." : error.message, variant: "destructive" }); return; }
    setOrgName(""); setOrgRole(""); setOrgImageUrl(""); setOrgOrder(organizers.length);
    toast({ title: "Organizer added" });
    fetchAll();
  };

  const handleDeleteOrganizer = async (id: string) => {
    await supabase.from("maze_organizers").delete().eq("id", id);
    toast({ title: "Organizer removed" });
    fetchAll();
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const eventBadge = (s: string) => {
    if (s === "READY")    return "bg-blue-500/15 text-blue-400";
    if (s === "STARTED")  return "bg-green-500/15 text-green-400";
    if (s === "FINISHED") return "bg-cyan-500/15 text-cyan-400";
    return "bg-red-500/15 text-red-400";
  };

  // ── Login screen ──────────────────────────────────────────────────────────────
  if (loading) return <Layout><div className="flex p-20 justify-center text-muted-foreground">Loading…</div></Layout>;

  if (!session) {
    return (
      <Layout>
        <div className="container max-w-sm mx-auto pt-20 px-4">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldAlert className="h-5 w-5 text-primary" /> Judge Sign In
              </CardTitle>
              <p className="text-sm text-muted-foreground">Enter your admin credentials to continue.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" required data-testid="input-email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required data-testid="input-password" />
                </div>
                <Button type="submit" className="w-full" data-testid="button-login">Sign In</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // ── Admin dashboard ───────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">

        {/* Page header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" /> Judge Admin
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {teams.length} teams · {runs.length} runs · {members.length} members · {organizers.length} organizers
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/teams" className="text-sm text-primary hover:underline flex items-center gap-1">
              <Users className="h-4 w-4" /> Bulk add teams
            </Link>
            <Button variant="outline" size="sm" onClick={() => supabase.auth.signOut()}
              className="border-destructive/40 text-destructive hover:bg-destructive hover:text-white" data-testid="button-logout">
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </div>

        {/* Row 1: Settings / Add team+run / Danger */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Competition settings */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Competition Settings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Active team (shown on timer)</Label>
                <Select value={settings.active_team_id || "none"} onValueChange={v => setSettings({ ...settings, active_team_id: v === "none" ? null : v })}>
                  <SelectTrigger data-testid="select-active-team"><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ranking method</Label>
                <Select value={settings.ranking_mode} onValueChange={v => setSettings({ ...settings, ranking_mode: v })}>
                  <SelectTrigger data-testid="select-ranking-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="best">Best single run</SelectItem>
                    <SelectItem value="average">Average of runs</SelectItem>
                    <SelectItem value="total">Total time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Max runs per team</Label>
                <Input type="number" min={1} max={10} value={settings.runs_per_team}
                  onChange={e => setSettings({ ...settings, runs_per_team: parseInt(e.target.value) })} data-testid="input-runs-per-team" />
              </div>
              <Button onClick={handleSaveSettings} className="w-full" data-testid="button-save-settings">
                <CheckCircle className="h-4 w-4 mr-2" /> Save Settings
              </Button>
            </CardContent>
          </Card>

          {/* Add team + manual run */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Add New Team</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleAddTeam} className="space-y-3">
                <Input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} placeholder="e.g. RoboRacer" required data-testid="input-team-name" />
                <Button type="submit" className="w-full" data-testid="button-add-team">Register Team</Button>
              </form>
            </CardContent>
            <CardHeader className="pb-3 pt-5 border-t border-border mt-2">
              <CardTitle className="text-base">Manual Run Entry</CardTitle>
              <p className="text-xs text-muted-foreground">Use if the ESP32 missed a run.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualBackup} className="space-y-3">
                <Select value={backupTeamId} onValueChange={setBackupTeamId}>
                  <SelectTrigger data-testid="select-manual-team"><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" step="0.01" value={backupTimeSec} onChange={e => setBackupTimeSec(e.target.value)} placeholder="Time in seconds (e.g. 14.55)" required data-testid="input-manual-time" />
                <Button type="submit" variant="secondary" className="w-full" data-testid="button-save-manual">Save Run</Button>
              </form>
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="border-destructive/20 bg-destructive/3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-1">Emergency ESP32 Reset</p>
                <p className="text-xs text-muted-foreground mb-2">Forces the timer back to the READY state.</p>
                <Button onClick={handleEmergencyReset} variant="outline" className="w-full border-red-500/50 text-red-400 hover:bg-red-600 hover:text-white hover:border-transparent" data-testid="button-esp-reset">
                  <Zap className="h-4 w-4 mr-2" /> Trigger Reset
                </Button>
              </div>
              <div className="pt-3 border-t border-destructive/20">
                <p className="text-sm font-medium mb-1">Clear All Run Data</p>
                <p className="text-xs text-muted-foreground mb-2">Permanently deletes every run for every team.</p>
                <Button onClick={handleClearRuns} variant="destructive" className="w-full" data-testid="button-clear-runs">
                  Delete All Runs
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Teams+Runs table / ESP32 events */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-base">Teams &amp; Runs</CardTitle></CardHeader>
            <CardContent className="overflow-auto max-h-[500px] p-0">
              {teams.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-10">No teams yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-card/50">
                    <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                      <th className="px-5 py-3 text-left">Team</th>
                      <th className="px-5 py-3 text-left">Runs</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map(team => {
                      const teamRuns = runs.filter(r => r.team_id === team.id);
                      return (
                        <tr key={team.id} className="border-b border-border/40 hover:bg-white/3 transition-colors" data-testid={`row-team-${team.id}`}>
                          <td className="px-5 py-3">
                            <div className="font-semibold text-white flex items-center gap-2">
                              {team.name}
                              {settings.active_team_id === team.id && (
                                <span className="bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded font-medium">Active</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            {teamRuns.length === 0 ? <span className="text-muted-foreground text-xs">No runs yet</span> : (
                              <div className="flex flex-wrap gap-1.5">
                                {teamRuns.map((run, i) => (
                                  <span key={run.id} className="flex items-center gap-1 bg-card border border-border px-2 py-0.5 rounded text-xs font-mono">
                                    R{i + 1}: {formatTimeMs(run.time_ms)}
                                    <button onClick={() => handleDeleteRun(run.id)} className="text-muted-foreground hover:text-destructive ml-1" data-testid={`button-delete-run-${run.id}`}>
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              {settings.active_team_id !== team.id && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                                  setSettings({ ...settings, active_team_id: team.id });
                                  supabase.from("maze_settings").update({ active_team_id: team.id }).eq("id", "default").then(() => fetchAll());
                                }} data-testid={`button-set-active-${team.id}`}>
                                  Set Active
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-7 border-destructive/40 text-destructive hover:bg-destructive hover:text-white" onClick={() => handleDeleteTeam(team.id)} data-testid={`button-delete-team-${team.id}`}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ESP32 Events</CardTitle>
              <p className="text-xs text-muted-foreground">Last 12 sensor events</p>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              {events.length === 0 ? (
                <p className="text-muted-foreground text-xs text-center py-4">No events recorded.</p>
              ) : events.map(evt => (
                <div key={evt.id} className="p-2.5 bg-card/50 border border-border rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-muted-foreground">{new Date(evt.created_at).toLocaleTimeString()}</span>
                    <span className="text-xs text-muted-foreground truncate max-w-[100px]">{evt.team_name || "System"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${eventBadge(evt.status)}`}>{evt.status}</span>
                    <span className="text-xs font-mono font-bold text-foreground">{evt.time_ms ? formatTimeMs(evt.time_ms) : (evt.message || "")}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Team members management */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" /> Team Members
            </CardTitle>
            <p className="text-xs text-muted-foreground">Add player names to each team — displayed publicly on the Teams page.</p>
          </CardHeader>
          <CardContent>
            {/* Add member form */}
            <form onSubmit={handleAddMember} className="flex flex-wrap gap-3 mb-6 p-4 bg-card/50 border border-border rounded-lg">
              <Select value={memberTeamId} onValueChange={setMemberTeamId}>
                <SelectTrigger className="w-48" data-testid="select-member-team"><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>{teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="Member name" className="flex-1 min-w-40" required data-testid="input-member-name" />
              <Button type="submit" data-testid="button-add-member">
                <Plus className="h-4 w-4 mr-1.5" /> Add Member
              </Button>
            </form>

            {/* Members per team */}
            {teams.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Register teams first.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map(team => {
                  const teamMembers = members.filter(m => m.team_id === team.id);
                  return (
                    <div key={team.id} className="border border-border rounded-lg p-3">
                      <p className="font-semibold text-sm text-white mb-2 flex items-center gap-1.5">
                        {team.name}
                        <span className="text-[10px] text-muted-foreground font-normal">({teamMembers.length})</span>
                      </p>
                      {teamMembers.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No members yet</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {teamMembers.map(m => (
                            <span key={m.id} className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 text-xs px-2 py-0.5 rounded-full">
                              {m.name}
                              <button onClick={() => handleDeleteMember(m.id)} className="hover:text-destructive transition-colors" data-testid={`button-delete-member-${m.id}`}>
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Row 4: Organizers management */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Club Organizers
            </CardTitle>
            <p className="text-xs text-muted-foreground">Manage the administration team displayed on the Organizers page.</p>
          </CardHeader>
          <CardContent>
            {/* Add organizer form */}
            <form onSubmit={handleAddOrganizer} className="flex flex-wrap gap-3 mb-6 p-4 bg-card/50 border border-border rounded-lg">
              <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Full name" className="flex-1 min-w-36" required data-testid="input-org-name" />
              <Input value={orgRole} onChange={e => setOrgRole(e.target.value)} placeholder="Role / Title" className="flex-1 min-w-36" required data-testid="input-org-role" />
              <Input value={orgImageUrl} onChange={e => setOrgImageUrl(e.target.value)} placeholder="Photo URL (optional)" className="flex-1 min-w-48" data-testid="input-org-image" />
              <Input type="number" value={orgOrder} onChange={e => setOrgOrder(parseInt(e.target.value) || 0)} placeholder="Order" className="w-20" data-testid="input-org-order" />
              <Button type="submit" data-testid="button-add-organizer">
                <Plus className="h-4 w-4 mr-1.5" /> Add
              </Button>
            </form>

            {/* Organizers grid */}
            {organizers.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No organizers added yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {organizers.map(org => (
                  <div key={org.id} className="border border-border rounded-lg p-3 flex flex-col items-center text-center gap-2 relative group" data-testid={`card-org-${org.id}`}>
                    <button
                      onClick={() => handleDeleteOrganizer(org.id)}
                      className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      data-testid={`button-delete-org-${org.id}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div className="w-14 h-14 rounded-full overflow-hidden border border-border bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                      {org.image_url ? (
                        <img src={org.image_url} alt={org.name} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        org.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-white leading-tight">{org.name}</p>
                      <p className="text-[10px] text-primary mt-0.5">{org.role}</p>
                      <p className="text-[10px] text-muted-foreground">Order: {org.display_order}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </Layout>
  );
}
