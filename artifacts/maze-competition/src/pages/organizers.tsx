import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Layout } from "@/components/layout";
import { Shield } from "lucide-react";

type Organizer = {
  id: string;
  name: string;
  role: string;
  image_url: string | null;
  display_order: number;
};

function Avatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="w-full h-full object-cover"
      />
    );
  }

  // Initials fallback
  const initials = name
    .split(" ")
    .map(w => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="w-full h-full flex items-center justify-center bg-primary/15 text-primary text-3xl font-bold">
      {initials}
    </div>
  );
}

export default function OrganizersPage() {
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

  useEffect(() => {
    async function fetchOrganizers() {
      const { data, error } = await supabase
        .from("maze_organizers")
        .select("*")
        .order("display_order");

      if (error) {
        const isTableMissing = error.message?.toLowerCase().includes("schema cache") || error.code === "42P01" || error.code === "PGRST106";
        setError(
          isTableMissing
            ? "The maze_organizers table doesn't exist yet. Go to your Supabase dashboard → SQL Editor and run the file esp32/supabase_new_tables.sql."
            : error.message
        );
      } else {
        setOrganizers(data || []);
      }
      setLoading(false);
    }
    fetchOrganizers();
  }, []);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary text-sm font-medium px-4 py-1.5 rounded-full mb-4">
            <Shield className="h-4 w-4" />
            ASU Robotics Club
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">Club Administration</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            The team behind the ASU Maze Competition — organizers, supervisors, and technical leads.
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm text-center">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-muted-foreground py-16">Loading…</div>
        ) : organizers.length === 0 ? (
          <div className="text-center py-20">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-20 text-primary" />
            <p className="text-muted-foreground">No organizers added yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in as admin and add organizers from the Admin panel.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {organizers.map(org => (
              <div
                key={org.id}
                className="flex flex-col items-center text-center group"
                data-testid={`card-organizer-${org.id}`}
              >
                {/* Photo */}
                <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-border group-hover:border-primary/40 transition-colors mb-3 shadow-lg">
                  <Avatar name={org.name} imageUrl={org.image_url} />
                </div>
                {/* Info */}
                <h3 className="font-bold text-white text-sm leading-tight">{org.name}</h3>
                <p className="text-xs text-primary mt-1 font-medium">{org.role}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
