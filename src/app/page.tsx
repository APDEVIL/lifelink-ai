import Link from "next/link";

const ROLES = [
  {
    href: "/bystander",
    icon: "🆘",
    label: "Bystander",
    desc: "Report an emergency & get first-aid guidance",
    color: "hover:border-red-500/50 hover:bg-red-500/5",
    badge: "PUBLIC",
    badgeColor: "bg-red-500/20 text-red-400",
  },
  {
    href: "/paramedic",
    icon: "🚑",
    label: "Paramedic",
    desc: "GPS tracking, patient triage & vitals on scene",
    color: "hover:border-green-500/50 hover:bg-green-500/5",
    badge: "CREW",
    badgeColor: "bg-green-500/20 text-green-400",
  },
  {
    href: "/hospital",
    icon: "🏥",
    label: "Hospital ER",
    desc: "Incoming patient briefing & bed management",
    color: "hover:border-blue-500/50 hover:bg-blue-500/5",
    badge: "ER TEAM",
    badgeColor: "bg-blue-500/20 text-blue-400",
  },
  {
    href: "/commander",
    icon: "🎖",
    label: "Commander",
    desc: "All active emergencies, dispatch & overview",
    color: "hover:border-amber-500/50 hover:bg-amber-500/5",
    badge: "COMMAND",
    badgeColor: "bg-amber-500/20 text-amber-400",
  },
  {
    href: "/police",
    icon: "🚦",
    label: "Traffic Control",
    desc: "Signal corridor log & police control room",
    color: "hover:border-purple-500/50 hover:bg-purple-500/5",
    badge: "POLICE",
    badgeColor: "bg-purple-500/20 text-purple-400",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1.5 mb-6">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400 font-semibold uppercase tracking-widest">Emergency Response System</span>
        </div>
        <h1 className="text-5xl font-black text-white mb-3 tracking-tight">
          Res<span className="text-red-500">Q</span>
        </h1>
        <p className="text-zinc-400 text-lg max-w-md mx-auto">
          Real-time mass casualty incident management powered by AI agents
        </p>
      </div>

      {/* Role cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
        {ROLES.map((r) => (
          <Link key={r.href} href={r.href}
            className={`card-surface p-5 flex flex-col gap-3 transition-all cursor-pointer group ${r.color}`}>
            <div className="flex items-start justify-between">
              <span className="text-3xl">{r.icon}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.badgeColor}`}>
                {r.badge}
              </span>
            </div>
            <div>
              <h2 className="font-bold text-white text-lg leading-tight group-hover:text-white">
                {r.label}
              </h2>
              <p className="text-sm text-zinc-500 mt-1 leading-snug">{r.desc}</p>
            </div>
            <div className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">
              Open dashboard →
            </div>
          </Link>
        ))}
      </div>

      <p className="text-xs text-zinc-700 mt-10">
        ResQ · AI-powered emergency coordination · Real-time via Pusher
      </p>
    </main>
  );
}