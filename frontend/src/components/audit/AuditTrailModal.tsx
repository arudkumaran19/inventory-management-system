import { useEffect, useState } from "react"
import {
    CheckCircle2,
    Hash,
    RefreshCw,
    Search,
    Shield,
    ShieldAlert,
    ShieldCheck,
    X,
} from "lucide-react"
import {
    getAuditLogs,
    verifyAuditChain,
    type AuditChainVerification,
    type AuditLogEntry,
} from "../../lib/api"

type AuditTrailModalProps = {
    isOpen: boolean
    onClose: () => void
}

export function AuditTrailModal({ isOpen, onClose }: AuditTrailModalProps) {
    const [logs, setLogs] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [filterType, setFilterType] = useState<string>("")
    const [searchQuery, setSearchQuery] = useState<string>("")
    const [verification, setVerification] = useState<AuditChainVerification | null>(null)
    const [verifying, setVerifying] = useState(false)

    const handleVerify = async () => {
        try {
            setVerifying(true)
            const result = await verifyAuditChain()
            setVerification(result)
        } catch (e) {
            console.error(e)
        } finally {
            setVerifying(false)
        }
    }

    useEffect(() => {
        if (!isOpen) return
        let ignore = false
        getAuditLogs(filterType || undefined)
            .then((data) => {
                if (!ignore) {
                    setLogs(data)
                    setLoading(false)
                }
            })
            .catch((e) => {
                console.error(e)
                if (!ignore) setLoading(false)
            })

        verifyAuditChain()
            .then((result) => {
                if (!ignore) {
                    setVerification(result)
                    setVerifying(false)
                }
            })
            .catch((e) => {
                console.error(e)
                if (!ignore) setVerifying(false)
            })

        return () => {
            ignore = true
        }
    }, [isOpen, filterType])

    if (!isOpen) return null

    const filteredLogs = logs.filter((log) => {
        if (!searchQuery) return true
        const q = searchQuery.toLowerCase()
        return (
            log.event_type.toLowerCase().includes(q) ||
            (log.actor_email && log.actor_email.toLowerCase().includes(q)) ||
            (log.resource_id && log.resource_id.toLowerCase().includes(q)) ||
            (log.payload && log.payload.toLowerCase().includes(q))
        )
    })

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-5xl max-h-[90vh] rounded-3xl border border-[#E8E3DB] bg-white shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#E8E3DB] bg-[#FAF8F5] px-6 py-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                            <Shield className="size-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="font-serif-brand text-lg font-bold text-[#1C1917]">
                                    Immutable Cryptographic Audit Trail
                                </h2>
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#EDF6EE] px-2.5 py-0.5 text-xs font-semibold text-[#4E6047] border border-[#CFDFCF]">
                                    <ShieldCheck className="size-3.5" />
                                    DB-Enforced Append-Only
                                </span>
                            </div>
                            <p className="text-xs text-[#78716C] mt-0.5">
                                SHA-256 blockchain-style hashed ledger. Database triggers strictly forbid UPDATE or DELETE.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void handleVerify()}
                            disabled={verifying}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] transition cursor-pointer disabled:opacity-50"
                        >
                            <RefreshCw className={["size-3", verifying ? "animate-spin text-[#78350F]" : ""].join(" ")} />
                            Verify Chain
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F2EB] hover:text-[#1C1917] transition cursor-pointer"
                        >
                            <X className="size-5" />
                        </button>
                    </div>
                </div>

                {/* Chain Verification Status Card */}
                {verification && (
                    <div className="border-b border-[#E8E3DB] bg-[#FAF8F5]/50 px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                            {verification.valid ? (
                                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                            ) : (
                                <ShieldAlert className="size-4 text-rose-600 shrink-0" />
                            )}
                            <span className="font-semibold text-[#1C1917]">
                                {verification.valid
                                    ? `Cryptographic Chain Verified (${verification.total_records} sequential records intact)`
                                    : `Chain Verification Failed: ${verification.error}`}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-[#78716C]">
                            <Hash className="size-3 text-[#A8A29E]" />
                            <span>Head Hash: {verification.chain_head_hash.slice(0, 16)}...</span>
                        </div>
                    </div>
                )}

                {/* Filter and Search Bar */}
                <div className="border-b border-[#E8E3DB] bg-white px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#1C1917] outline-none"
                        >
                            <option value="">All Event Types</option>
                            <option value="AUTH_LOGIN_SUCCESS">Login</option>
                            <option value="AUTH_LOGOUT">Logout</option>
                            <option value="ORDER_CHECKOUT_RESERVED">Order Checkout</option>
                            <option value="PAYMENT_COMPLETED">Payment Completed</option>
                            <option value="STOCK_ADJUSTMENT">Stock Adjustment</option>
                            <option value="SHIFT_OPENED">Shift Opened</option>
                            <option value="SHIFT_CLOSED">Shift Closed</option>
                            <option value="RECIPE_BOM_DEDUCTION">Recipe BOM Deduction</option>
                            <option value="INGREDIENT_UPDATED">Ingredient Restock</option>
                        </select>
                    </div>

                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#A8A29E]" />
                        <input
                            type="text"
                            placeholder="Filter by actor, resource..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 pl-8 pr-3 py-1.5 text-xs outline-none focus:bg-white"
                        />
                    </div>
                </div>

                {/* Table Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="py-12 flex items-center justify-center gap-2 text-xs text-[#78716C]">
                            <RefreshCw className="size-4 animate-spin text-[#78350F]" />
                            Loading audit ledger...
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="py-12 text-center text-xs text-[#78716C]">
                            No audit records match the current filter.
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-[#E8E3DB] text-[#78716C] uppercase font-bold tracking-wider">
                                    <th className="pb-3 px-3">Seq #</th>
                                    <th className="pb-3 px-3">Timestamp</th>
                                    <th className="pb-3 px-3">Event Type</th>
                                    <th className="pb-3 px-3">Actor</th>
                                    <th className="pb-3 px-3">Target</th>
                                    <th className="pb-3 px-3">Payload</th>
                                    <th className="pb-3 px-3">SHA-256 Hash</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]/60">
                                {filteredLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-[#FAF8F5]/80">
                                        <td className="py-3 px-3 font-mono font-bold text-[#78350F]">
                                            #{log.sequence_number}
                                        </td>
                                        <td className="py-3 px-3 text-[#1C1917] whitespace-nowrap">
                                            {new Date(log.timestamp).toLocaleString([], {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                second: "2-digit",
                                            })}
                                        </td>
                                        <td className="py-3 px-3">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FAF8F5] text-[#1C1917] border border-[#E8E3DB]">
                                                {log.event_type}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-[#44403C]">
                                            {log.actor_email ? (
                                                <span title={log.actor_role || ""}>{log.actor_email}</span>
                                            ) : (
                                                <span className="text-[#A8A29E]">System</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 font-mono text-[#78716C]">
                                            {log.resource_type} {log.resource_id ? `#${log.resource_id}` : ""}
                                        </td>
                                        <td className="py-3 px-3 text-[#78716C] max-w-xs truncate" title={log.payload || ""}>
                                            {log.payload || "—"}
                                        </td>
                                        <td className="py-3 px-3 font-mono text-[10px] text-[#A8A29E]" title={`Previous: ${log.previous_hash}\nRecord: ${log.record_hash}`}>
                                            {log.record_hash.slice(0, 10)}...
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-[#E8E3DB] bg-[#FAF8F5] px-6 py-3 flex justify-between items-center shrink-0 text-xs text-[#78716C]">
                    <span>Immutable Audit Log Ledger • Cryptographic Chaining Active</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 font-semibold text-[#1C1917] hover:bg-[#F5F2EB] transition cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
