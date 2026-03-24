"use client"

import { useEffect, useState, useCallback } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { DashboardCircleIcon, Activity01Icon, Search01Icon, ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import Link from "next/link"

interface StatsData {
  active_connections: number;
  active_rooms: number;
}

interface DeviceData {
  device_id: string;
  device_name: string;
  ip: string;
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
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const pathWithSlash = cleanPath.endsWith('/') ? cleanPath : `${cleanPath}/`;
  
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${window.location.protocol}//${hostname}:8001/api${pathWithSlash}`;
  }
  
  if (!hostname.startsWith("api-")) {
    return `${window.location.protocol}//api-${hostname}/api${pathWithSlash}`;
  }
  
  return `${window.location.protocol}//${window.location.host}/api${pathWithSlash}`;
};

export default function DebugDashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [rooms, setRooms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, devRes, roomRes] = await Promise.all([
        fetch(getApiUrl("/debug/stats")),
        fetch(getApiUrl("/debug/devices")),
        fetch(getApiUrl("/debug/rooms"))
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (devRes.ok) setDevices((await devRes.json()).devices);
      if (roomRes.ok) setRooms((await roomRes.json()).rooms);
    } catch (e) {
      console.error("Failed to fetch debug data", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !stats) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-foreground">
        <HugeiconsIcon icon={Activity01Icon} className="w-10 h-10 animate-ping text-primary/50" />
      </div>
    );
  }

  return (
    <main className="min-h-svh bg-background text-foreground pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-background/70 border-b border-border/40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 -ml-2 rounded-full hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors">
              <HugeiconsIcon icon={ArrowLeft01Icon} className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <HugeiconsIcon icon={DashboardCircleIcon} className="w-4.5 h-4.5 text-primary" />
              </div>
              <span className="text-lg font-bold tracking-tight">Debug Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Polling every 3s
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 mt-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border/40 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
              <HugeiconsIcon icon={DashboardCircleIcon} className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Active Connections</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{stats?.active_connections ?? 0}</span>
          </div>
          <div className="rounded-2xl border border-border/40 bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground">
              <HugeiconsIcon icon={Search01Icon} className="w-5 h-5 text-orange-500" />
              <span className="text-sm font-medium">Active Rooms</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{stats?.active_rooms ?? 0}</span>
          </div>
        </div>

        {/* Detail Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Devices Table */}
          <div className="col-span-1 lg:col-span-2 space-y-4">
            <h3 className="text-lg font-semibold tracking-tight px-1">Connected Devices</h3>
            <div className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">Device Name</th>
                    <th className="px-6 py-4 font-medium">Network IP</th>
                    <th className="px-6 py-4 font-medium">Device ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {devices.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">No active devices</td>
                    </tr>
                  ) : (
                    devices.map((d) => (
                      <tr key={d.device_id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-4 font-medium text-foreground">{d.device_name}</td>
                        <td className="px-6 py-4 text-muted-foreground font-mono">{d.ip}</td>
                        <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{d.device_id}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Rooms List */}
          <div className="col-span-1 space-y-4">
            <h3 className="text-lg font-semibold tracking-tight px-1">Active Rooms</h3>
            <div className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm">
              <div className="p-2 space-y-2">
                {Object.keys(rooms).length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No active rooms</div>
                ) : (
                  Object.entries(rooms).map(([ip, peers]) => (
                    <div key={ip} className="p-4 rounded-xl bg-secondary/30 border border-border/30">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary/70 animate-pulse" />
                          <span className="font-mono text-sm font-medium">{ip}</span>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border/50">
                          {peers.length} peers
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {peers.map(peerId => {
                          const dev = devices.find(d => d.device_id === peerId);
                          return (
                            <div key={peerId} className="text-xs px-2 py-1 bg-background border border-border/50 rounded-md text-muted-foreground truncate max-w-[140px]" title={dev?.device_name || peerId}>
                              {dev?.device_name || peerId.substring(0, 8)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
