import SetTheme from "@/components/shared/setTheme"

export default function RootGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-svh">
      <div className="fixed top-5 right-5 z-[60]">
        <SetTheme />
      </div>
      {children}
    </div>
  )
}
