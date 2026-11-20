import { useCallback, useEffect, useState } from "react"
import {
    Bell,
    ChevronDown,
    CircleHelp,
    Clock,
    Coffee,
    LogOut,
    MapPin,
    Menu,
    Shield,
    ShieldCheck,
    ShoppingCart,
    Sparkles,
    Wifi,
    WifiOff,
} from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import {
    getCurrentShift,
    getLocations,
    type Location,
    type ShiftSummary,
} from "../../lib/api"
import { ShiftModal } from "./ShiftModal"
import { AuditTrailModal } from "../audit/AuditTrailModal"

type TopBarProps = {
    title: string
    cartItemCount?: number
    onMenuClick?: () => void
}

export function TopBar({
    title,
    cartItemCount = 0,
    onMenuClick,
}: TopBarProps) {
    const { user, logout } = useAuth()
    const [openPanel, setOpenPanel] = useState<
        "notifications" | "help" | "profile" | null
    >(null)
    const [shiftModalOpen, setShiftModalOpen] = useState(false)
    const [currentShift, setCurrentShift] = useState<ShiftSummary | null>(null)
    const [locations, setLocations] = useState<Location[]>([])
    const [activeLocation, setActiveLocation] = useState<Location | null>(null)
    const [isOnline, setIsOnline] = useState<boolean>(() =>
        typeof navigator !== "undefined" ? navigator.onLine : true,
    )
    const [auditModalOpen, setAuditModalOpen] = useState(false)

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)
        window.addEventListener("online", handleOnline)
        window.addEventListener("offline", handleOffline)
        return () => {
            window.removeEventListener("online", handleOnline)
            window.removeEventListener("offline", handleOffline)
        }
    }, [])

    useEffect(() => {
        let ignore = false
        getLocations()
            .then((list) => {
                if (!ignore && list.length > 0) {
                    setLocations(list)
                    setActiveLocation(list[0])
                }
            })
            .catch(() => {})
        return () => {
            ignore = true
        }
    }, [])

    const loadShift = useCallback(async () => {
        try {
            const s = await getCurrentShift()
            setCurrentShift(s)
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        let ignore = false
        getCurrentShift()
            .then((s) => {
                if (!ignore) {
                    setCurrentShift(s)
                }
            })
            .catch(() => {})
        return () => {
            ignore = true
        }
    }, [])

    function togglePanel(panel: "notifications" | "help" | "profile") {
        setOpenPanel((current) => (current === panel ? null : panel))
    }

    return (
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#E8E3DB] bg-[#FAF8F5]/90 px-4 backdrop-blur-md sm:px-6 select-none">
            <div className="flex min-w-0 items-center gap-3">
                {onMenuClick && (
                    <button
                        type="button"
                        onClick={onMenuClick}
                        aria-label="Open navigation"
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#E8E3DB] text-[#57534E] transition-colors hover:bg-white hover:text-[#1C1917] active:scale-95 xl:hidden"
                    >
                        <Menu className="size-5" />
                    </button>
                )}

                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-semibold text-[#78350F] tracking-wide uppercase">
                            Artisan Café
                        </span>
                        <span className="text-[#D8D1C5]">•</span>

                        {/* Location Branch Selector */}
                        {locations.length > 0 && (
                            <>
                                <div className="inline-flex items-center gap-1 rounded-full bg-[#FAF8F5] px-2.5 py-0.5 border border-[#E8E3DB]">
                                    <MapPin className="size-3 text-[#78350F]" />
                                    <select
                                        value={activeLocation?.id || ""}
                                        onChange={(e) => {
                                            const found = locations.find((l) => l.id === Number(e.target.value))
                                            if (found) setActiveLocation(found)
                                        }}
                                        className="bg-transparent text-[11px] font-semibold text-[#1C1917] outline-none cursor-pointer border-none p-0 pr-1"
                                    >
                                        {locations.map((loc) => (
                                            <option key={loc.id} value={loc.id}>
                                                {loc.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <span className="text-[#D8D1C5]">•</span>
                            </>
                        )}

                        {/* Online / Offline Connectivity Pill */}
                        <span
                            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isOnline
                                    ? "bg-[#EDF6EE] text-[#215A36] border-[#C8E3CE]"
                                    : "bg-[#FEF8EC] text-[#8C4E08] border-[#F7E0B5]"
                            }`}
                        >
                            {isOnline ? (
                                <>
                                    <Wifi className="size-3 text-[#4E6047]" />
                                    <span>Online</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="size-3 text-[#8C4E08]" />
                                    <span>Offline (Queue Active)</span>
                                </>
                            )}
                        </span>
                        <span className="text-[#D8D1C5]">•</span>

                        {/* Shift Status Pill */}
                        <button
                            type="button"
                            onClick={() => setShiftModalOpen(true)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition-all ${
                                currentShift
                                    ? "bg-[#EDF6EE] text-[#215A36] border-[#C8E3CE] hover:bg-[#E2F0E4]"
                                    : "bg-[#FEF8EC] text-[#8C4E08] border-[#F7E0B5] hover:bg-[#FDF2D9]"
                            }`}
                        >
                            <Clock className="size-3" />
                            <span>{currentShift ? `Shift Active ($${Number(currentShift.shift.opening_float).toFixed(0)} Float)` : "Open Shift"}</span>
                        </button>
                    </div>

                    <h1 className="truncate font-serif-brand text-lg font-bold tracking-tight text-[#1C1917] sm:text-xl">
                        {title}
                    </h1>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
                {/* Help Menu */}
                <div className="relative">
                    <button
                        type="button"
                        aria-label="Help"
                        aria-expanded={openPanel === "help"}
                        onClick={() => togglePanel("help")}
                        className={[
                            "flex size-9 items-center justify-center rounded-xl border transition-all duration-150 active:scale-95",
                            openPanel === "help"
                                ? "border-[#D8D1C5] bg-white text-[#1C1917] shadow-xs"
                                : "border-transparent text-[#78716C] hover:border-[#E8E3DB] hover:bg-white hover:text-[#1C1917]",
                        ].join(" ")}
                    >
                        <CircleHelp className="size-4.5" />
                    </button>

                    {openPanel === "help" && (
                        <div className="absolute right-0 top-11 z-[80] w-80 rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-xl shadow-[#78350F]/5 animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="flex items-center gap-2.5 border-b border-[#E8E3DB] pb-3">
                                <div className="flex size-7 items-center justify-center rounded-lg bg-[#FAF8F5] text-[#78350F] border border-[#E8E3DB]">
                                    <Coffee className="size-4" />
                                </div>
                                <div>
                                    <p className="font-serif-brand text-sm font-bold text-[#1C1917]">
                                        Quick Guide
                                    </p>
                                    <p className="text-[11px] text-[#78716C]">
                                        How to use the POS
                                    </p>
                                </div>
                            </div>

                            <div className="mt-3 space-y-2 text-xs leading-5 text-[#57534E]">
                                <div className="rounded-xl bg-[#FAF8F5] border border-[#E8E3DB]/60 p-2.5">
                                    <strong className="font-semibold text-[#1C1917]">
                                        1. Add to Order:
                                    </strong>{" "}
                                    Tap items from the menu to add them to the current order.
                                </div>

                                <div className="rounded-xl bg-[#FAF8F5] border border-[#E8E3DB]/60 p-2.5">
                                    <strong className="font-semibold text-[#1C1917]">
                                        2. Complete Sale:
                                    </strong>{" "}
                                    Tap Complete Sale to hold items for 5 minutes during payment.
                                </div>

                                <div className="rounded-xl bg-[#FAF8F5] border border-[#E8E3DB]/60 p-2.5">
                                    <strong className="font-semibold text-[#1C1917]">
                                        3. Receive Payment:
                                    </strong>{" "}
                                    Accept cash, card, or mobile payment to finalize the sale.
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Notifications Menu */}
                <div className="relative">
                    <button
                        type="button"
                        aria-label="Notifications"
                        aria-expanded={openPanel === "notifications"}
                        onClick={() => togglePanel("notifications")}
                        className={[
                            "relative flex size-9 items-center justify-center rounded-xl border transition-all duration-150 active:scale-95",
                            openPanel === "notifications"
                                ? "border-[#D8D1C5] bg-white text-[#1C1917] shadow-xs"
                                : "border-transparent text-[#78716C] hover:border-[#E8E3DB] hover:bg-white hover:text-[#1C1917]",
                        ].join(" ")}
                    >
                        <Bell className="size-4.5" />

                        {cartItemCount > 0 && (
                            <span className="absolute right-2 top-2 size-2 rounded-full bg-[#78350F] ring-2 ring-white" />
                        )}
                    </button>

                    {openPanel === "notifications" && (
                        <div className="absolute right-0 top-11 z-[80] w-80 rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-xl shadow-[#78350F]/5 animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="flex items-center justify-between border-b border-[#E8E3DB] pb-3">
                                <p className="font-serif-brand text-sm font-bold text-[#1C1917]">
                                    System Status
                                </p>
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#EDF6EE] px-2 py-0.5 text-[10px] font-bold text-[#215A36] border border-[#C8E3CE]">
                                    <ShieldCheck className="size-3" />
                                    Connected
                                </span>
                            </div>

                            <div className="mt-3 space-y-2">
                                <div className="flex items-start gap-2.5 rounded-xl border border-[#C8E3CE] bg-[#EDF6EE]/60 p-2.5">
                                    <span className="mt-1 flex size-2 rounded-full bg-[#4E6047] shrink-0" />
                                    <div>
                                        <p className="text-xs font-semibold text-[#215A36]">
                                            POS Online
                                        </p>
                                        <p className="mt-0.5 text-[11px] leading-4 text-[#215A36]/80">
                                            Connected and ready to take orders.
                                        </p>
                                    </div>
                                </div>

                                {cartItemCount > 0 ? (
                                    <div className="flex items-start gap-2.5 rounded-xl border border-[#F7E0B5] bg-[#FEF8EC] p-2.5">
                                        <Sparkles className="size-3.5 text-[#78350F] shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-semibold text-[#8C4E08]">
                                                Current Order
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-[#8C4E08]/80">
                                                {cartItemCount} {cartItemCount === 1 ? "item" : "items"} in order.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="py-2 text-center text-[11px] text-[#A8A29E]">
                                        No active orders
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mx-1 h-5 w-px bg-[#E8E3DB]" />

                {/* Cart indicator badge */}
                <div className="flex items-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 shadow-xs">
                    <ShoppingCart className="size-4 text-[#78350F]" />
                    <span className="text-xs font-semibold text-[#1C1917]">
                        Order
                    </span>
                    <span
                        className={[
                            "flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold transition-all",
                            cartItemCount > 0
                                ? "bg-[#78350F] text-white"
                                : "bg-[#F5F1EA] text-[#78716C]",
                        ].join(" ")}
                    >
                        {cartItemCount}
                    </span>
                </div>

                {/* Operator Profile Capsule */}
                {user && (
                    <div className="relative">
                        <button
                            type="button"
                            aria-label="Profile"
                            aria-expanded={openPanel === "profile"}
                            onClick={() => togglePanel("profile")}
                            className={[
                                "flex items-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-2.5 py-1.5 shadow-xs transition-all duration-150 hover:border-[#D8D1C5] hover:bg-[#FAF8F5] active:scale-95",
                                openPanel === "profile" ? "border-[#78350F] ring-2 ring-[#78350F]/15" : "",
                            ].join(" ")}
                        >
                            <div className={[
                                "flex size-6 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-xs",
                                user.role === "manager"
                                    ? "bg-[#78350F]"
                                    : "bg-[#4E6047]",
                            ].join(" ")}>
                                {user.display_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="hidden text-left sm:block">
                                <p className="truncate text-xs font-semibold leading-tight text-[#1C1917]">
                                    {user.display_name}
                                </p>
                                <p className="text-[10px] font-medium text-[#78716C] capitalize">
                                    {user.role}
                                </p>
                            </div>
                            <ChevronDown className="size-3 text-[#A8A29E]" />
                        </button>

                        {openPanel === "profile" && (
                            <div className="absolute right-0 top-11 z-[80] w-64 rounded-2xl border border-[#E8E3DB] bg-white p-3 shadow-xl shadow-[#78350F]/5 animate-in fade-in slide-in-from-top-2 duration-150">
                                <div className="border-b border-[#E8E3DB] pb-2.5 px-1">
                                    <p className="font-serif-brand text-sm font-bold text-[#1C1917] truncate">
                                        {user.display_name}
                                    </p>
                                    <p className="text-[11px] text-[#78716C] truncate">
                                        {user.email}
                                    </p>
                                    <div
                                        className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize border"
                                        style={{
                                            backgroundColor: user.role === "manager" ? "#FEF8EC" : "#EDF6EE",
                                            color: user.role === "manager" ? "#8C4E08" : "#215A36",
                                            borderColor: user.role === "manager" ? "#F7E0B5" : "#C8E3CE",
                                        }}
                                    >
                                        <Shield className="size-3" />
                                        {user.role}
                                    </div>
                                </div>

                                {user.role === "manager" && (
                                    <div className="pt-2 border-b border-[#E8E3DB] pb-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setOpenPanel(null)
                                                setAuditModalOpen(true)
                                            }}
                                            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-[#1C1917] transition-colors hover:bg-[#FAF8F5] active:scale-[0.98]"
                                        >
                                            <ShieldCheck className="size-3.5 text-[#215A36]" />
                                            <span>Audit Trail Ledger</span>
                                        </button>
                                    </div>
                                )}

                                <div className="pt-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setOpenPanel(null)
                                            logout()
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-[#9B2C2C] transition-colors hover:bg-[#FDF2F2] active:scale-[0.98]"
                                    >
                                        <LogOut className="size-3.5" />
                                        <span>Sign Out</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ShiftModal
                isOpen={shiftModalOpen}
                onClose={() => setShiftModalOpen(false)}
                currentShift={currentShift}
                onShiftUpdated={() => void loadShift()}
            />

            <AuditTrailModal
                isOpen={auditModalOpen}
                onClose={() => setAuditModalOpen(false)}
            />
        </header>
    )
}
