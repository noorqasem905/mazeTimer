import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { Layout } from "@/components/layout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Database, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function TeamsBulkAddPage() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [inputData, setInputData] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        setLocation("/admin");
      }
      setLoading(false);
    });
  }, [setLocation]);

  const parsedTeams = inputData
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const handleSubmit = async () => {
    if (parsedTeams.length === 0) return;
    setIsSubmitting(true);
    
    const inserts = parsedTeams.map(name => ({ name }));
    
    const { error } = await supabase.from("maze_teams").insert(inserts);
    
    setIsSubmitting(false);
    
    if (error) {
      toast({ title: "Bulk insert failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `Added ${parsedTeams.length} teams.` });
      setInputData("");
      setLocation("/admin");
    }
  };

  if (loading || !session) {
    return <Layout><div className="p-20 font-mono text-center">LOADING...</div></Layout>;
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <Link href="/admin" className="font-mono text-sm text-muted-foreground hover:text-primary flex items-center transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            BACK_TO_CONTROL_PANEL
          </Link>
        </div>

        <Card className="border-primary/20 bg-black/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="font-mono text-primary flex items-center gap-2 text-xl">
              <Database className="h-6 w-6" />
              BULK_ADD_TEAMS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-mono text-muted-foreground">Enter team names, one per line.</p>
              <Textarea 
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder="Team Alpha&#10;Beta Robotics&#10;Gamma Engineers"
                className="font-mono min-h-[200px]"
              />
            </div>

            {parsedTeams.length > 0 && (
              <div className="p-4 border border-border bg-card/50 rounded font-mono text-sm space-y-2">
                <div className="text-primary font-bold">PREVIEW: {parsedTeams.length} teams to add</div>
                <div className="max-h-40 overflow-auto text-muted-foreground flex flex-col gap-1">
                  {parsedTeams.map((name, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Plus className="h-3 w-3 text-green-500" />
                      {name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={handleSubmit} 
              disabled={parsedTeams.length === 0 || isSubmitting}
              className="w-full font-mono bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSubmitting ? "PROCESSING..." : `EXECUTE_INSERT_BATCH (${parsedTeams.length})`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
