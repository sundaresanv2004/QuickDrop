import { Header } from "@/components/home/Header"
import { DeviceInfo } from "@/components/home/DeviceInfo"
import { DeviceList } from "@/components/home/DeviceList"

export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-[600px] px-4 py-8 w-full h-full flex flex-col">
        <Header />
        <DeviceInfo />
        <DeviceList />
      </div>
    </main>
  )
}
