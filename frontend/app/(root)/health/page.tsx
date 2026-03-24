"use client"

import { useEffect, useState, useCallback } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Activity01Icon, Time02Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import Link from "next/link"

interface HealthData {
  status: string;
  service: string;
  version: string;
  uptime: number;
}

const getApiUrl = (path: string) => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  // If envUrl is set, ensure it doesn't have a trailing slash, and path has a leading slash
  if (envUrl && envUrl.trim() !== "") {
    const base = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }
  if (typeof window === "undefined") return `http://localhost:8001/api${path}`;
  
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${window.location.protocol}//${hostname}:8001/api${path}`;
  }
  
  if (!hostname.startsWith("api-")) {
    return `${window.location.protocol}//api-${hostname}/api${path}`;
  }
  
  return `${window.location.protocol}//${window.location.host}/api${path}`;
};

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/health"));
      if (res.ok) {
        setHealth(await res.json());
        setError(false);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-4">
          <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
            <HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
          </Link>
          <span className="text-lg font-bold tracking-tight">Server Health</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 mt-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {error && !health ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <p className="text-destructive font-bold mb-2">Backend unreachable</p>
            <div className="text-sm text-muted-foreground space-y-2 mt-4 text-left font-mono bg-background/50 p-4 rounded-lg border border-border/20">
              <p>Attempted URL: <span className="text-foreground break-all">{getApiUrl("/health")}</span></p>
              <p>Check: <a href={getApiUrl("/health")} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open API Link in New Tab</a></p>
              <p className="mt-4 text-xs">If the link above works but this page still shows "unreachable", check your browser's console for CORS or SSL errors.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <StatCard title="Status" value={health?.status.toUpperCase() || "--"} icon={<HugeiconsIcon icon={Activity01Icon} className="w-5 h-5 text-green-500" />} />
            <StatCard title="Service" value={health?.service || "--"} icon={<HugeiconsIcon icon={Activity01Icon} className="w-5 h-5 text-blue-500" />} />
            <StatCard title="Version" value={health?.version || "--"} icon={<HugeiconsIcon icon={Activity01Icon} className="w-5 h-5 text-primary" />} />
            <StatCard title="Uptime" value={health ? formatUptime(health.uptime) : "--"} icon={<HugeiconsIcon icon={Time02Icon} className="w-5 h-5 text-orange-500" />} />
          </div>
        )}

      </div>
    </main>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <span className="text-2xl font-bold tracking-tight">{value}</span>
    </div>
  );
}
