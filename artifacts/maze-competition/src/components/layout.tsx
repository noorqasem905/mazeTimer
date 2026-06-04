import { Link, useLocation } from "wouter";
import { Activity, Trophy, Settings, Users, Shield } from "lucide-react";

const navLinks = [
  { href: "/",             icon: <Activity className="h-4 w-4" />, label: "Timer"       },
  { href: "/leaderboard",  icon: <Trophy   className="h-4 w-4" />, label: "Leaderboard" },
  { href: "/participants", icon: <Users    className="h-4 w-4" />, label: "Teams"       },
  { href: "/organizers",   icon: <Shield   className="h-4 w-4" />, label: "Organizers"  },
  { href: "/admin",        icon: <Settings className="h-4 w-4" />, label: "Admin"       },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground dark">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center px-4">
          <Link href="/" className="flex items-center gap-2 mr-4 shrink-0">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-bold font-mono tracking-wider text-sm hidden sm:inline">
              ASU Maze
            </span>
          </Link>

          <nav className="flex items-center gap-1 flex-wrap">
            {navLinks.map(({ href, icon, label }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                  isActive(href)
                    ? "bg-primary/15 text-primary"
                    : "text-foreground/60 hover:text-foreground hover:bg-white/5"
                }`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
