import { useEffect, useState } from "react"
import {
    AlertTriangle,
    Coffee,
    Edit3,
    RefreshCw,
    X,
} from "lucide-react"
import {
    getIngredients,
    updateIngredient,
    type Ingredient,
} from "../../lib/api"

type IngredientsModalProps = {
    isOpen: boolean
    onClose: () => void
}

export function IngredientsModal({ isOpen, onClose }: IngredientsModalProps) {
    const [ingredients, setIngredients] = useState<Ingredient[]>([])
    const [loading, setLoading] = useState(false)
    const [editingIng, setEditingIng] = useState<Ingredient | null>(null)
    const [newStock, setNewStock] = useState("")
    const [restockReason, setRestockReason] = useState("Supplier Delivery")
    const [saving, setSaving] = useState(false)
    const [statusMessage, setStatusMessage] = useState("")

    useEffect(() => {
        if (!isOpen) return
        void loadIngredients()
    }, [isOpen])

    async function loadIngredients() {
        try {
            setLoading(true)
            const data = await getIngredients()
            setIngredients(data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    async function handleSaveStock() {
        if (!editingIng) return
        const val = parseFloat(newStock)
        if (Number.isNaN(val) || val < 0) return

        try {
            setSaving(true)
            await updateIngredient(editingIng.id, {
                current_stock: val,
                adjustment_reason: restockReason,
            })
            setStatusMessage(`Restocked ${editingIng.name} to ${val} ${editingIng.unit}`)
            setEditingIng(null)
            await loadIngredients()
            setTimeout(() => setStatusMessage(""), 3500)
        } catch (e) {
            console.error(e)
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-4xl max-h-[85vh] rounded-3xl border border-[#E8E3DB] bg-white shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#E8E3DB] bg-[#FAF8F5] px-6 py-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                            <Coffee className="size-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="font-serif-brand text-lg font-bold text-[#1C1917]">
                                    Raw Ingredients & Recipe BOM
                                </h2>
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF8EC] px-2.5 py-0.5 text-xs font-semibold text-[#78350F] border border-[#F2DEBA]">
                                    Automated Order Deductions
                                </span>
                            </div>
                            <p className="text-xs text-[#78716C] mt-0.5">
                                Track bulk coffee beans, milk varieties, syrups, and packaging with automatic recipe deductions upon checkout.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void loadIngredients()}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] transition cursor-pointer"
                        >
                            <RefreshCw className={["size-3", loading ? "animate-spin text-[#78350F]" : ""].join(" ")} />
                            Refresh
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

                {/* Status Toast */}
                {statusMessage && (
                    <div className="border-b border-[#CFDFCF] bg-[#EDF6EE] px-6 py-2.5 text-xs font-semibold text-[#4E6047] shrink-0">
                        ✓ {statusMessage}
                    </div>
                )}

                {/* Table Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="py-12 flex items-center justify-center gap-2 text-xs text-[#78716C]">
                            <RefreshCw className="size-4 animate-spin text-[#78350F]" />
                            Loading raw ingredient stocks...
                        </div>
                    ) : ingredients.length === 0 ? (
                        <div className="py-12 text-center text-xs text-[#78716C]">
                            No raw ingredients registered yet.
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-[#E8E3DB] text-[#78716C] uppercase font-bold tracking-wider">
                                    <th className="pb-3 px-3">Ingredient Name</th>
                                    <th className="pb-3 px-3">Current Stock</th>
                                    <th className="pb-3 px-3">Unit</th>
                                    <th className="pb-3 px-3">Reorder Point</th>
                                    <th className="pb-3 px-3">Unit Cost</th>
                                    <th className="pb-3 px-3">Status</th>
                                    <th className="pb-3 px-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]/60">
                                {ingredients.map((ing) => {
                                    const isLow = Number(ing.current_stock) <= Number(ing.reorder_threshold)
                                    return (
                                        <tr key={ing.id} className="hover:bg-[#FAF8F5]/80">
                                            <td className="py-3 px-3 font-semibold text-[#1C1917]">
                                                {ing.name}
                                            </td>
                                            <td className="py-3 px-3 font-mono font-bold text-sm text-[#1C1917] tnum">
                                                {Number(ing.current_stock).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-3 font-mono text-[#78716C]">
                                                {ing.unit}
                                            </td>
                                            <td className="py-3 px-3 font-mono text-[#78716C] tnum">
                                                {Number(ing.reorder_threshold).toLocaleString()} {ing.unit}
                                            </td>
                                            <td className="py-3 px-3 font-mono text-[#78716C] tnum">
                                                ${Number(ing.cost_per_unit).toFixed(4)}
                                            </td>
                                            <td className="py-3 px-3">
                                                {isLow ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                                                        <AlertTriangle className="size-3 text-amber-600" />
                                                        Low Stock
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                                                        Optimal
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-3 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingIng(ing)
                                                        setNewStock(String(ing.current_stock))
                                                        setRestockReason("Supplier Delivery")
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-[#E8E3DB] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] transition cursor-pointer"
                                                >
                                                    <Edit3 className="size-3 text-[#78716C]" />
                                                    Restock
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Edit Stock Drawer / Form */}
                {editingIng && (
                    <div className="border-t border-[#E8E3DB] bg-[#FAF8F5] p-5 shrink-0 animate-in slide-in-from-bottom-2">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <h3 className="font-serif-brand text-sm font-bold text-[#1C1917]">
                                    Restock / Adjust Level: {editingIng.name}
                                </h3>
                                <p className="text-xs text-[#78716C]">
                                    Current: {editingIng.current_stock} {editingIng.unit}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={newStock}
                                        onChange={(e) => setNewStock(e.target.value)}
                                        className="w-28 rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 text-xs font-mono font-bold outline-none"
                                        placeholder="New stock"
                                    />
                                    <span className="text-xs font-mono text-[#78716C]">{editingIng.unit}</span>
                                </div>

                                <select
                                    value={restockReason}
                                    onChange={(e) => setRestockReason(e.target.value)}
                                    className="rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] outline-none"
                                >
                                    <option value="Supplier Delivery">Supplier Delivery</option>
                                    <option value="Inventory Recount">Inventory Recount</option>
                                    <option value="Spillage / Waste">Spillage / Waste</option>
                                    <option value="Damaged Stock">Damaged Stock</option>
                                </select>

                                <button
                                    type="button"
                                    onClick={() => void handleSaveStock()}
                                    disabled={saving}
                                    className="rounded-xl bg-[#78350F] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#5C2B09] transition disabled:opacity-50 cursor-pointer"
                                >
                                    {saving ? "Saving..." : "Update Stock"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setEditingIng(null)}
                                    className="rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="border-t border-[#E8E3DB] bg-[#FAF8F5] px-6 py-3 flex justify-between items-center shrink-0 text-xs text-[#78716C]">
                    <span>Bill of Materials (BOM) System Active</span>
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
