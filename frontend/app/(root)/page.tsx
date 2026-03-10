import { Header } from "@/components/home/Header"
import { DeviceInfo } from "@/components/home/DeviceInfo"
import { DeviceList } from "@/components/home/DeviceList"

export default function Page() {
  return (
    <main className="relative min-h-screen bg-background overflow-hidden">
      {/* Subtle ambient gradient blobs */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-chart-2/5 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-[600px] px-5 py-10 w-full h-full flex flex-col">
        <Header />
        <DeviceInfo />
        <DeviceList />
      </div>
    </main>
  )
}
