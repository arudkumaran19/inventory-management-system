import { useState } from "react"
import { AlertCircle, Clock, DollarSign, Loader2, Lock, Unlock, X } from "lucide-react"
import { closeShift, openShift, type ShiftSummary } from "../../lib/api"

type ShiftModalProps = {
    isOpen: boolean
    onClose: () => void
    currentShift: ShiftSummary | null
    onShiftUpdated: () => void
}

export function ShiftModal({ isOpen, onClose, currentShift, onShiftUpdated }: ShiftModalProps) {
    const [openingFloat, setOpeningFloat] = useState("150.00")
    const [closingCash, setClosingCash] = useState("")
    const [notes, setNotes] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    if (!isOpen) return null

    const handleOpenShift = async () => {
        const val = parseFloat(openingFloat)
        if (isNaN(val) || val < 0) {
            setError("Please enter a valid opening float amount.")
            return
        }

        try {
            setLoading(true)
            setError(null)
            await openShift(val)
            onShiftUpdated()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to open shift")
        } finally {
            setLoading(false)
        }
    }

    const handleCloseShift = async () => {
        if (!currentShift) return
        const val = parseFloat(closingCash)
        if (isNaN(val) || val < 0) {
            setError("Please enter the counted cash amount in drawer.")
            return
        }

        try {
            setLoading(true)
            setError(null)
            await closeShift(currentShift.shift.id, val, notes)
            onShiftUpdated()
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to close shift")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#E8E3DB]">
                <div className="flex items-center justify-between border-b border-[#E8E3DB] pb-3 mb-4">
                    <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-xl bg-[#FAF8F5] text-[#78350F] border border-[#E8E3DB]">
                            {currentShift ? <Clock className="size-4" /> : <Lock className="size-4" />}
                        </div>
                        <div>
                            <h3 className="font-serif-brand text-base font-bold text-[#1C1917]">
                                {currentShift ? "Register Shift (X/Z Report)" : "Open Register Shift"}
                            </h3>
                            <p className="text-[11px] text-[#78716C]">
                                {currentShift ? "Daily register balancing & cash reconciliation" : "Set opening float to begin trading"}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-[#78716C] hover:bg-[#F5F1EA] hover:text-[#1C1917]"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {!currentShift ? (
                    /* Open shift form */
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-[#1C1917] mb-1">
                                Opening Cash Float ($)
                            </label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-2.5 size-4 text-stone-400" />
                                <input
                                    type="number"
                                    step="0.01"
                                    value={openingFloat}
                                    onChange={(e) => setOpeningFloat(e.target.value)}
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] py-2 pl-9 pr-3 text-sm font-semibold text-[#1C1917] focus:border-[#78350F] focus:outline-hidden"
                                    placeholder="150.00"
                                />
                            </div>
                            <p className="mt-1 text-[11px] text-[#78716C]">
                                Enter the verified starting cash in the till drawer.
                            </p>
                        </div>

                        <button
                            type="button"
                            disabled={loading}
                            onClick={handleOpenShift}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#78350F] text-xs font-bold text-white shadow-sm hover:bg-[#5A270B] active:scale-98 transition-all disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="size-4 animate-spin" /> : <Unlock className="size-4" />}
                            Start Shift & Open Register
                        </button>
                    </div>
                ) : (
                    /* Active shift details & Close Shift (Z-Report) */
                    <div className="space-y-4">
                        {/* Summary Metrics */}
                        <div className="rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] p-3.5 space-y-2 text-xs">
                            <div className="flex justify-between font-medium text-[#78716C]">
                                <span>Shift Opened:</span>
                                <span className="font-semibold text-[#1C1917]">
                                    {new Date(currentShift.shift.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <div className="flex justify-between font-medium text-[#78716C]">
                                <span>Opening Float:</span>
                                <span className="font-semibold text-[#1C1917]">
                                    ${Number(currentShift.shift.opening_float).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between font-medium text-[#78716C]">
                                <span>Cash Sales:</span>
                                <span className="font-semibold text-[#215A36]">
                                    +${Number(currentShift.cash_sales).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between font-medium text-[#78716C]">
                                <span>Card Sales:</span>
                                <span className="font-semibold text-[#1C1917]">
                                    ${Number(currentShift.card_sales).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex justify-between font-medium text-[#78716C]">
                                <span>Orders Count:</span>
                                <span className="font-semibold text-[#1C1917]">
                                    {currentShift.total_orders} orders
                                </span>
                            </div>
                            <div className="my-1 border-b border-[#E8E3DB]" />
                            <div className="flex justify-between font-bold text-sm text-[#1C1917]">
                                <span>Expected Cash in Drawer:</span>
                                <span className="text-[#78350F] font-extrabold">
                                    ${Number(currentShift.expected_cash).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        {/* Close Shift Form */}
                        <div className="space-y-3 pt-1">
                            <div>
                                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                                    Actual Cash Counted ($)
                                </label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-2.5 size-4 text-stone-400" />
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={closingCash}
                                        onChange={(e) => setClosingCash(e.target.value)}
                                        className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] py-2 pl-9 pr-3 text-sm font-semibold text-[#1C1917] focus:border-[#78350F] focus:outline-hidden"
                                        placeholder={Number(currentShift.expected_cash).toFixed(2)}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-[#1C1917] mb-1">
                                    Reconciliation Notes (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] px-3 py-2 text-xs text-[#1C1917] focus:border-[#78350F] focus:outline-hidden"
                                    placeholder="e.g. Exact match, or petty cash expense"
                                />
                            </div>

                            <button
                                type="button"
                                disabled={loading}
                                onClick={handleCloseShift}
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#9B2C2C] text-xs font-bold text-white shadow-sm hover:bg-[#7D2323] active:scale-98 transition-all disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                                Close Shift & Print Z-Report
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
