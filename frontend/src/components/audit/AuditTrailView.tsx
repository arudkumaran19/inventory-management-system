import { useEffect, useMemo, useState } from "react"
import {
    Activity,
    Copy,
    Database,
    Hash,
    Lock,
    RefreshCw,
    Search,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Terminal,
    X,
} from "lucide-react"
import { Toast } from "../ui/Toast"
import {
    getAuditLogs,
    verifyAuditChain,
    type AuditChainVerification,
    type AuditLogEntry,
} from "../../lib/api"

function getEventBadge(eventType: string) {
    if (eventType.startsWith("AUTH_LOGIN")) {
        return "bg-sky-50 text-sky-700 border-sky-200"
    }
    if (eventType.startsWith("AUTH_LOGOUT")) {
        return "bg-stone-100 text-stone-700 border-stone-200"
    }
    if (eventType.includes("PAYMENT_COMPLETED") || eventType.includes("ORDER_CHECKOUT")) {
        return "bg-emerald-50 text-emerald-800 border-emerald-200"
    }
    if (eventType.includes("FAILED") || eventType.includes("EXPIRED")) {
        return "bg-rose-50 text-rose-700 border-rose-200"
    }
    if (eventType.includes("SHIFT")) {
        return "bg-violet-50 text-violet-700 border-violet-200"
    }
    if (eventType.includes("STOCK") || eventType.includes("INGREDIENT") || eventType.includes("PRODUCT")) {
        return "bg-amber-50 text-amber-800 border-amber-200"
    }
    if (eventType.includes("BOM") || eventType.includes("RECIPE")) {
        return "bg-indigo-50 text-indigo-700 border-indigo-200"
    }
    return "bg-[#FAF8F5] text-[#1C1917] border-[#E8E3DB]"
}

export function AuditTrailView() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [filterCategory, setFilterCategory] = useState<string>("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [verification, setVerification] = useState<AuditChainVerification | null>(null)
    const [verifying, setVerifying] = useState(false)
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)
    const [toastMessage, setToastMessage] = useState<string | null>(null)

    async function loadData() {
        setLoading(true)
        try {
            const data = await getAuditLogs()
            setLogs(data)
        } catch (e) {
            console.error(e)
            setToastMessage("Failed to load audit records")
        } finally {
            setLoading(false)
        }
    }

    async function runVerification() {
        setVerifying(true)
        try {
            const res = await verifyAuditChain()
            setVerification(res)
            if (res.valid) {
                setToastMessage(`Cryptographic chain verified (${res.total_records} records intact)`)
            } else {
                setToastMessage(`Chain verification failed: ${res.error}`)
            }
        } catch (e) {
            console.error(e)
            setToastMessage("Verification request failed")
        } finally {
            setVerifying(false)
        }
    }

    useEffect(() => {
        let ignore = false
        getAuditLogs()
            .then((data) => {
                if (!ignore) {
                    setLogs(data)
                    setLoading(false)
                }
            })
            .catch(() => {
                if (!ignore) setLoading(false)
            })

        verifyAuditChain()
            .then((res) => {
                if (!ignore) setVerification(res)
            })
            .catch(() => {})

        return () => {
            ignore = true
        }
    }, [])

    const filteredLogs = useMemo(() => {
        return logs.filter((log) => {
            // Category filter
            if (filterCategory === "auth" && !log.event_type.startsWith("AUTH_")) return false
            if (filterCategory === "orders" && !log.event_type.includes("ORDER") && !log.event_type.includes("PAYMENT")) return false
            if (filterCategory === "inventory" && !log.event_type.includes("STOCK") && !log.event_type.includes("PRODUCT")) return false
            if (filterCategory === "shifts" && !log.event_type.includes("SHIFT")) return false
            if (filterCategory === "bom" && !log.event_type.includes("RECIPE") && !log.event_type.includes("BOM") && !log.event_type.includes("INGREDIENT")) return false

            // Search query filter
            if (!searchQuery.trim()) return true
            const q = searchQuery.toLowerCase().trim()
            return (
                log.event_type.toLowerCase().includes(q) ||
                (log.actor_email && log.actor_email.toLowerCase().includes(q)) ||
                (log.resource_type && log.resource_type.toLowerCase().includes(q)) ||
                (log.resource_id && log.resource_id.toLowerCase().includes(q)) ||
                (log.payload && log.payload.toLowerCase().includes(q)) ||
                log.record_hash.toLowerCase().includes(q)
            )
        })
    }, [logs, filterCategory, searchQuery])

    // KPI Metrics counts
    const authEventsCount = useMemo(() => logs.filter((l) => l.event_type.startsWith("AUTH_")).length, [logs])
    const orderEventsCount = useMemo(() => logs.filter((l) => l.event_type.includes("ORDER") || l.event_type.includes("PAYMENT")).length, [logs])
    const stockEventsCount = useMemo(() => logs.filter((l) => l.event_type.includes("STOCK") || l.event_type.includes("INGREDIENT") || l.event_type.includes("RECIPE")).length, [logs])

    const categoryCounts: Record<string, number> = useMemo(() => ({
        all: logs.length,
        orders: orderEventsCount,
        inventory: logs.filter((l) => l.event_type.includes("STOCK") || l.event_type.includes("PRODUCT")).length,
        bom: logs.filter((l) => l.event_type.includes("RECIPE") || l.event_type.includes("BOM") || l.event_type.includes("INGREDIENT")).length,
        shifts: logs.filter((l) => l.event_type.includes("SHIFT")).length,
        auth: authEventsCount,
    }), [logs, orderEventsCount, authEventsCount])

    function copyToClipboard(text: string, label = "Hash copied") {
        navigator.clipboard.writeText(text)
        setToastMessage(label)
    }

    return (
        <div className="p-6 lg:p-8 space-y-6">
            <div className="mx-auto max-w-7xl">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                <Shield className="size-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h1 className="font-serif-brand text-2xl font-medium tracking-tight text-[#1C1917]">
                                        Audit Trail
                                    </h1>
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDF6EE] px-2.5 py-0.5 text-xs font-semibold text-[#4E6047] border border-[#CFDFCF]">
                                        <ShieldCheck className="size-3.5" />
                                        Cryptographic SHA-256 Ledger
                                    </span>
                                </div>
                                <p className="text-xs text-[#78716C] mt-0.5">
                                    Append-only security and compliance log. Database triggers prevent modification or deletion.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => void runVerification()}
                            disabled={verifying}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#C8E3CE] bg-[#EDF6EE] px-3.5 py-2.5 text-xs font-semibold text-[#215A36] shadow-xs hover:bg-[#E2F0E4] transition cursor-pointer disabled:opacity-50"
                        >
                            <RefreshCw className={["size-3.5", verifying ? "animate-spin text-[#215A36]" : ""].join(" ")} />
                            <span>{verifying ? "Verifying..." : "Verify Hash Chain"}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => void loadData()}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1C1917] shadow-xs hover:bg-[#FAF8F5] transition cursor-pointer disabled:opacity-50"
                        >
                            <RefreshCw className={["size-3.5", loading ? "animate-spin text-[#78350F]" : "text-[#78716C]"].join(" ")} />
                            <span>Refresh</span>
                        </button>
                    </div>
                </div>

                {/* KPI Metrics Dashboard Cards */}
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {/* Total Events */}
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Total Ledger Records</span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                <Database className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">
                                {logs.length}
                            </span>
                            <span className="text-xs text-[#A8A29E]">sequential events</span>
                        </div>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Append-only sequential chain
                        </p>
                    </div>

                    {/* Cryptographic Chain Integrity */}
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Chain Integrity</span>
                            <div className={`flex size-8 items-center justify-center rounded-lg border ${
                                verification?.valid
                                    ? "bg-[#EDF6EE] text-[#4E6047] border-[#CFDFCF]"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}>
                                {verification?.valid ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="font-serif-brand text-2xl font-bold tracking-tight text-[#1C1917]">
                                {verification?.valid ? "100% Intact" : "Check Failed"}
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-[#78716C] font-mono truncate" title={verification?.chain_head_hash || ""}>
                            Head: {verification?.chain_head_hash ? `${verification.chain_head_hash.slice(0, 12)}...` : "Genesis"}
                        </p>
                    </div>

                    {/* Orders & Payments */}
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Sales & Payments</span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-[#EDF6EE] text-[#4E6047] border border-[#CFDFCF]">
                                <Activity className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">
                                {orderEventsCount}
                            </span>
                            <span className="text-xs text-[#A8A29E]">transactions</span>
                        </div>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Checkouts, tenders & settlements
                        </p>
                    </div>

                    {/* Stock & BOM Adjustments */}
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Inventory & Recipes</span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                <Lock className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">
                                {stockEventsCount}
                            </span>
                            <span className="text-xs text-[#A8A29E]">audit adjustments</span>
                        </div>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Deliveries, recounts & BOM usages
                        </p>
                    </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="mt-6 rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-2xs">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        {/* Category filter pills */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {[
                                { id: "all", label: "All Events" },
                                { id: "orders", label: "Orders & Tender" },
                                { id: "inventory", label: "Stock & Products" },
                                { id: "bom", label: "BOM & Recipes" },
                                { id: "shifts", label: "Register Shifts" },
                                { id: "auth", label: "Staff & Auth" },
                            ].map((tab) => {
                                const count = categoryCounts[tab.id] ?? 0
                                const isSelected = filterCategory === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setFilterCategory(tab.id)}
                                        className={[
                                            "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer",
                                            isSelected
                                                ? "bg-[#78350F] text-white shadow-xs"
                                                : "bg-[#FAF8F5] text-[#78716C] hover:bg-[#F5F2EB] hover:text-[#1C1917] border border-[#E8E3DB]",
                                        ].join(" ")}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={[
                                            "px-1.5 py-0.2 rounded-md text-[10px] font-bold",
                                            isSelected
                                                ? "bg-white/20 text-white"
                                                : "bg-[#E8E3DB]/70 text-[#78716C]",
                                        ].join(" ")}>
                                            {count}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Search input */}
                        <div className="relative w-full lg:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#A8A29E]" />
                            <input
                                type="text"
                                placeholder="Search event, actor, hash..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 pl-9 pr-4 py-2 text-xs text-[#1C1917] outline-none transition placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F]"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A8A29E] hover:text-[#1C1917]"
                                >
                                    <X className="size-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Ledger Data Table */}
                <div className="overflow-hidden rounded-2xl border border-[#E8E3DB] bg-white shadow-xs">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-3 text-sm text-[#78716C]">
                            <RefreshCw className="size-6 animate-spin text-[#78350F]" />
                            <span>Loading tamper-evident ledger...</span>
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="py-20 text-center text-sm text-[#78716C]">
                            <Shield className="mx-auto size-8 text-[#A8A29E] mb-2" />
                            <p className="font-semibold text-[#1C1917]">No Audit Records Found</p>
                            <p className="text-xs text-[#A8A29E] mt-1">Try clearing filters or search terms.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-[#E8E3DB] bg-[#FAF8F5] text-[#78716C] uppercase font-bold tracking-wider text-[11px]">
                                        <th className="py-3.5 px-4">Sequence</th>
                                        <th className="py-3.5 px-4">Date & Time</th>
                                        <th className="py-3.5 px-4">Event Type</th>
                                        <th className="py-3.5 px-4">Actor</th>
                                        <th className="py-3.5 px-4">Target Resource</th>
                                        <th className="py-3.5 px-4">Details / Summary</th>
                                        <th className="py-3.5 px-4">Cryptographic Hash</th>
                                        <th className="py-3.5 px-4 text-right">Inspect</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E8E3DB]/60">
                                    {filteredLogs.map((log) => {
                                        const badgeClass = getEventBadge(log.event_type)
                                        return (
                                            <tr
                                                key={log.id}
                                                className="hover:bg-[#FAF8F5]/80 transition-colors group cursor-pointer"
                                                onClick={() => setSelectedLog(log)}
                                            >
                                                {/* Sequence # */}
                                                <td className="py-3.5 px-4 font-mono font-bold text-[#78350F]">
                                                    #{log.sequence_number}
                                                </td>

                                                {/* Timestamp */}
                                                <td className="py-3.5 px-4 text-[#1C1917] whitespace-nowrap font-medium">
                                                    {new Date(log.timestamp).toLocaleString([], {
                                                        month: "short",
                                                        day: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                        second: "2-digit",
                                                    })}
                                                </td>

                                                {/* Event Type Badge */}
                                                <td className="py-3.5 px-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badgeClass}`}>
                                                        {log.event_type}
                                                    </span>
                                                </td>

                                                {/* Operator / Actor */}
                                                <td className="py-3.5 px-4">
                                                    {log.actor_email ? (
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-[#1C1917] truncate max-w-[140px]">
                                                                {log.actor_email}
                                                            </span>
                                                            <span className="text-[10px] text-[#A8A29E] uppercase font-bold">
                                                                {log.actor_role || "User"}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[#A8A29E] font-medium">System Automated</span>
                                                    )}
                                                </td>

                                                {/* Resource */}
                                                <td className="py-3.5 px-4 font-mono text-xs text-[#78716C] whitespace-nowrap">
                                                    <span className="capitalize font-semibold text-[#1C1917]">{log.resource_type}</span>
                                                    {log.resource_id && ` #${log.resource_id}`}
                                                </td>

                                                {/* Summary / Payload */}
                                                <td className="py-3.5 px-4 text-[#44403C] max-w-xs truncate" title={log.payload || ""}>
                                                    {log.payload ? (
                                                        <span className="font-mono text-[11px] text-[#78716C]">{log.payload}</span>
                                                    ) : (
                                                        <span className="text-[#A8A29E]">—</span>
                                                    )}
                                                </td>

                                                {/* SHA-256 Hash with Copy */}
                                                <td className="py-3.5 px-4 font-mono text-[11px] text-[#78716C] whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span title={`Current Record Hash:\n${log.record_hash}\n\nPrevious Chained Hash:\n${log.previous_hash}`}>
                                                            {log.record_hash.slice(0, 10)}…{log.record_hash.slice(-4)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                copyToClipboard(log.record_hash, `Hash #${log.sequence_number} copied`)
                                                            }}
                                                            className="text-[#A8A29E] hover:text-[#78350F] p-0.5 rounded transition"
                                                            title="Copy Full SHA-256 Hash"
                                                        >
                                                            <Copy className="size-3" />
                                                        </button>
                                                    </div>
                                                </td>

                                                {/* Details Action */}
                                                <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLog(log)}
                                                        className="rounded-lg border border-[#E8E3DB] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] transition cursor-pointer"
                                                    >
                                                        Details
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Verification Notice Banner */}
                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-[#EDF6EE] text-[#4E6047] border border-[#CFDFCF] shrink-0">
                            <ShieldCheck className="size-4.5" />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-[#1C1917]">
                                Cryptographic Integrity Guaranteed
                            </p>
                            <p className="text-[11px] text-[#78716C] mt-0.5">
                                Each event is hashed using SHA-256 combined with the previous record's hash signature. Any database tampering immediately breaks the chain.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 font-mono text-[11px] text-[#78716C] shrink-0">
                        <Hash className="size-3.5 text-[#A8A29E]" />
                        <span>Chaining Algorithm: SHA-256 / Append-Only</span>
                    </div>
                </div>
            </div>

            {/* Inspect Drawer / Detail Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-2xl rounded-3xl border border-[#E8E3DB] bg-white shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
                        {/* Drawer Header */}
                        <div className="flex items-center justify-between border-b border-[#E8E3DB] bg-[#FAF8F5] px-6 py-4 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="flex size-9 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                    <Terminal className="size-4" />
                                </div>
                                <div>
                                    <h3 className="font-serif-brand text-base font-bold text-[#1C1917]">
                                        Audit Entry #{selectedLog.sequence_number}
                                    </h3>
                                    <p className="text-xs text-[#78716C]">
                                        Recorded {new Date(selectedLog.timestamp).toUTCString()}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSelectedLog(null)}
                                className="rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F2EB] hover:text-[#1C1917] transition cursor-pointer"
                            >
                                <X className="size-5" />
                            </button>
                        </div>

                        {/* Drawer Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 p-3">
                                    <span className="text-[10px] font-bold text-[#78716C] uppercase tracking-wider block">
                                        Event Type
                                    </span>
                                    <span className="mt-1 font-semibold text-[#1C1917] text-sm block">
                                        {selectedLog.event_type}
                                    </span>
                                </div>

                                <div className="rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 p-3">
                                    <span className="text-[10px] font-bold text-[#78716C] uppercase tracking-wider block">
                                        Actor
                                    </span>
                                    <span className="mt-1 font-semibold text-[#1C1917] block truncate">
                                        {selectedLog.actor_email || "System"} ({selectedLog.actor_role || "automated"})
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 p-3 space-y-2">
                                <span className="text-[10px] font-bold text-[#78716C] uppercase tracking-wider block">
                                    Cryptographic Signatures
                                </span>
                                <div>
                                    <span className="text-[10px] text-[#A8A29E] block">Record Hash (SHA-256):</span>
                                    <p className="font-mono text-[11px] text-[#1C1917] break-all select-all mt-0.5">
                                        {selectedLog.record_hash}
                                    </p>
                                </div>
                                <div className="border-t border-[#E8E3DB] pt-2">
                                    <span className="text-[10px] text-[#A8A29E] block">Previous Hash (Chained):</span>
                                    <p className="font-mono text-[11px] text-[#78716C] break-all select-all mt-0.5">
                                        {selectedLog.previous_hash}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <span className="text-[10px] font-bold text-[#78716C] uppercase tracking-wider block">
                                    Event Payload Data
                                </span>
                                <pre className="rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] p-3.5 font-mono text-[11px] text-[#1C1917] overflow-x-auto whitespace-pre-wrap">
                                    {selectedLog.payload
                                        ? JSON.stringify(JSON.parse(selectedLog.payload), null, 2)
                                        : "No payload payload associated with this event."}
                                </pre>
                            </div>
                        </div>

                        {/* Drawer Footer */}
                        <div className="border-t border-[#E8E3DB] bg-[#FAF8F5] px-6 py-3 flex justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => setSelectedLog(null)}
                                className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 font-semibold text-[#1C1917] hover:bg-[#F5F2EB] transition cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Toast
                message={toastMessage}
                variant="success"
                duration={3500}
                onClose={() => setToastMessage(null)}
            />
        </div>
    )
}
