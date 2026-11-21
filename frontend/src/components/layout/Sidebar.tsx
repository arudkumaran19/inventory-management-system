import {
    ClipboardList,
    Coffee,
    Package,
    ShieldCheck,
    ShoppingCart,
    Users,
    X,
} from "lucide-react"
import { useAuth } from "../../context/AuthContext"

export type AppPage = "pos" | "orders" | "inventory" | "users" | "audit"

type SidebarProps = {
    activePage: AppPage
    onNavigate: (page: AppPage) => void
    onClose?: () => void
}

const navigation: {
    label: string
    subtitle: string
    page: AppPage
    icon: typeof ShoppingCart
    managerOnly?: boolean
}[] = [
    {
        label: "POS",
        subtitle: "Take orders & payments",
        page: "pos",
        icon: ShoppingCart,
    },
    {
        label: "Sales History",
        subtitle: "Past orders & receipts",
        page: "orders",
        icon: ClipboardList,
    },
    {
        label: "Stock",
        subtitle: "Products & availability",
        page: "inventory",
        icon: Package,
        managerOnly: true,
    },
    {
        label: "Staff",
        subtitle: "Team accounts & roles",
        page: "users",
        icon: Users,
        managerOnly: true,
    },
    {
        label: "Audit Trail",
        subtitle: "Compliance & ledger",
        page: "audit",
        icon: ShieldCheck,
        managerOnly: true,
    },
]

export function Sidebar({
    activePage,
    onNavigate,
    onClose,
}: SidebarProps) {
    const { user, isManager } = useAuth()

    const visibleNavigation = navigation.filter(
        (item) => !item.managerOnly || isManager,
    )

    return (
        <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[#E8E3DB] bg-[#FAF8F5] text-[#1C1917] select-none">
            {/* Brand Header */}
            <div className="flex h-16 items-center justify-between border-b border-[#E8E3DB] px-5 bg-white">
                <div className="flex items-center gap-3">
                    <div className="relative flex size-9 items-center justify-center rounded-xl bg-[#78350F] text-white shadow-sm shadow-[#78350F]/20">
                        <Coffee className="size-4.5 text-[#F5F1EA]" />
                        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[#4E6047] ring-2 ring-white" />
                    </div>

                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <p className="truncate font-serif-brand text-base font-bold tracking-tight text-[#1C1917]">
                                Artisan Café
                            </p>
                            <span className="rounded bg-[#78350F]/10 px-1.5 py-0.2 text-[9px] font-bold tracking-widest text-[#78350F] uppercase">
                                POS
                            </span>
                        </div>

                        <p className="text-[11px] font-medium text-[#78716C]">
                            Register &amp; Stock
                        </p>
                    </div>
                </div>

                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close navigation"
                        className="flex size-8 items-center justify-center rounded-lg text-[#78716C] transition-colors hover:bg-[#F5F1EA] hover:text-[#1C1917]"
                    >
                        <X className="size-4" />
                    </button>
                )}
            </div>

            {/* Navigation Section */}
            <div className="px-4 pt-5 pb-2">
                <p className="text-[10px] font-bold tracking-wider text-[#A8A29E] uppercase">
                    Navigation
                </p>
            </div>

            <nav
                className="flex-1 space-y-1.5 px-3"
                aria-label="Primary navigation"
            >
                {visibleNavigation.map((item) => {
                    const Icon = item.icon
                    const active = activePage === item.page

                    return (
                        <button
                            key={item.page}
                            type="button"
                            onClick={() => onNavigate(item.page)}
                            className={[
                                "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150",
                                active
                                    ? "bg-white text-[#78350F] shadow-sm border border-[#E8E3DB] font-semibold"
                                    : "text-[#57534E] hover:bg-[#F5F1EA] hover:text-[#1C1917]",
                            ].join(" ")}
                        >
                            {/* Left Active Accent Pill */}
                            {active && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-[#78350F]" />
                            )}

                            <div
                                className={[
                                    "flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-150 group-hover:scale-105",
                                    active
                                        ? "bg-[#78350F]/10 text-[#78350F]"
                                        : "bg-[#F5F1EA] text-[#78716C] group-hover:text-[#1C1917]",
                                ].join(" ")}
                            >
                                <Icon className="size-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm leading-tight font-medium">
                                    {item.label}
                                </p>
                                <p className="truncate text-[10px] text-[#A8A29E]">
                                    {item.subtitle}
                                </p>
                            </div>
                        </button>
                    )
                })}
            </nav>

            {/* Operational Status Footer */}
            <div className="border-t border-[#E8E3DB] p-3.5 bg-white">
                <div className="rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] p-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#292524]">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#4E6047] opacity-75" />
                                <span className="relative inline-flex size-2 rounded-full bg-[#4E6047]" />
                            </span>
                            POS Online
                        </div>
                        <span className="rounded-full bg-[#EDF6EE] px-2 py-0.5 text-[10px] font-bold text-[#215A36] border border-[#C8E3CE]">
                            Active
                        </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#78716C] pt-2 border-t border-[#E8E3DB]/60">
                        <span className="truncate max-w-[130px] font-medium text-[#1C1917]">
                            {user ? user.display_name : "POS Station"}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold capitalize ${
                            user?.role === "admin"
                                ? "bg-purple-100 text-purple-800 border border-purple-200"
                                : user?.role === "manager"
                                    ? "bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]"
                                    : "bg-[#F5F1EA] text-[#57534E]"
                        }`}>
                            {user ? (user.role === "admin" ? "Administrator" : user.role) : "Staff"}
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    )
}
