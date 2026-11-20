import { useState } from "react"
import {
    BookmarkCheck,
    Coffee,
    FileText,
    Loader2,
    Minus,
    Percent,
    Plus,
    Receipt,
    ShoppingCart,
    Trash2,
    X,
} from "lucide-react"

export type CartItem = {
    id: number
    name: string
    price: number
    quantity: number
    notes?: string | null
}

type CartPanelProps = {
    items: CartItem[]
    discountPercent?: number
    discountReason?: string | null
    onIncrease?: (productId: number) => void
    onDecrease?: (productId: number) => void
    onRemove?: (productId: number) => void
    onCheckout?: () => void
    onClose?: () => void
    onParkOrder?: (label: string) => void
    onApplyDiscount?: (percent: number, reason: string) => void
    onUpdateNotes?: (productId: number, notes: string) => void
    isCheckingOut?: boolean
    reservedOrderId?: number | null
}

export function CartPanel({
    items,
    discountPercent = 0,
    discountReason = null,
    onIncrease,
    onDecrease,
    onRemove,
    onCheckout,
    onClose,
    onParkOrder,
    onApplyDiscount,
    onUpdateNotes,
    isCheckingOut = false,
    reservedOrderId = null,
}: CartPanelProps) {
    const [parkModalOpen, setParkModalOpen] = useState(false)
    const [parkLabel, setParkLabel] = useState("")
    const [discountModalOpen, setDiscountModalOpen] = useState(false)
    const [selectedDiscount, setSelectedDiscount] = useState("10")
    const [customReason, setCustomReason] = useState("Staff Discount")
    const [noteModalItem, setNoteModalItem] = useState<CartItem | null>(null)
    const [itemNoteText, setItemNoteText] = useState("")

    const subtotal = items.reduce(
        (total, item) => total + item.price * item.quantity,
        0,
    )
    const discountAmount = discountPercent > 0 ? (subtotal * discountPercent) / 100 : 0
    const finalTotal = Math.max(0, subtotal - discountAmount)
    const itemCount = items.reduce(
        (total, item) => total + item.quantity,
        0,
    )

    const handleConfirmPark = () => {
        if (!parkLabel.trim()) return
        onParkOrder?.(parkLabel.trim())
        setParkModalOpen(false)
        setParkLabel("")
    }

    const handleConfirmDiscount = () => {
        const p = parseFloat(selectedDiscount)
        if (!isNaN(p)) {
            onApplyDiscount?.(p, customReason.trim() || `${p}% Discount`)
        }
        setDiscountModalOpen(false)
    }

    const handleSaveNote = () => {
        if (noteModalItem) {
            onUpdateNotes?.(noteModalItem.id, itemNoteText.trim())
            setNoteModalItem(null)
        }
    }

    return (
        <section className="flex h-full min-h-0 w-full flex-col bg-white border-l border-[#E8E3DB] select-none">
            {/* Cart Header */}
            <div className="flex items-center justify-between border-b border-[#E8E3DB] bg-[#FAF8F5] px-5 py-3.5">
                <div>
                    <div className="flex items-center gap-2">
                        <Receipt className="size-4 text-[#78350F]" />
                        <h2 className="font-serif-brand text-base font-bold tracking-tight text-[#1C1917]">
                            Current Order
                        </h2>
                    </div>

                    <p className="mt-0.5 text-xs text-[#78716C] font-medium">
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {items.length > 0 && !reservedOrderId && onParkOrder && (
                        <button
                            type="button"
                            onClick={() => setParkModalOpen(true)}
                            title="Park / Hold order for another customer"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E8E3DB] bg-white px-2 py-1 text-[11px] font-bold text-[#78350F] hover:bg-[#FAF8F5] active:scale-95 transition-all shadow-2xs"
                        >
                            <BookmarkCheck className="size-3.5 text-[#B45309]" />
                            Park
                        </button>
                    )}

                    {items.length > 0 && (
                        <span
                            className={[
                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide",
                                reservedOrderId
                                    ? "bg-[#FEF8EC] text-[#8C4E08] border border-[#F7E0B5]"
                                    : "bg-[#F5F1EA] text-[#57534E] border border-[#E8E3DB]",
                            ].join(" ")}
                        >
                            <span
                                className={[
                                    "size-1.5 rounded-full",
                                    reservedOrderId ? "bg-[#B45309] animate-pulse" : "bg-[#A8A29E]",
                                ].join(" ")}
                            />
                            {reservedOrderId
                                ? `Order #${reservedOrderId} Hold`
                                : "Active"}
                        </span>
                    )}

                    {onClose && (
                        <button
                            type="button"
                            aria-label="Close cart"
                            onClick={onClose}
                            className="flex size-8 items-center justify-center rounded-lg text-[#78716C] transition-colors hover:bg-[#F5F1EA] hover:text-[#1C1917] active:scale-95"
                        >
                            <X className="size-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Cart Body */}
            {items.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <div className="relative flex size-14 items-center justify-center rounded-2xl bg-[#FAF8F5] text-[#78350F] border border-[#E8E3DB] shadow-xs">
                        <Coffee className="size-6 text-[#78350F]" />
                        <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#1C1917] text-white">
                            <ShoppingCart className="size-2.5" />
                        </span>
                    </div>

                    <h3 className="mt-4 font-serif-brand text-sm font-bold text-[#1C1917]">
                        Your order is empty
                    </h3>

                    <p className="mt-1 max-w-xs text-xs leading-relaxed text-[#78716C]">
                        Add products from the menu to begin.
                    </p>
                </div>
            ) : (
                <>
                    {/* Item list */}
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="group relative rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/50 p-2.5 transition-all duration-150 hover:bg-white hover:border-[#D8D1C5] hover:shadow-2xs"
                            >
                                <div className="flex items-start justify-between gap-2.5">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="truncate text-xs font-bold text-[#1C1917]">
                                            {item.name}
                                        </h3>

                                        <p className="tnum mt-0.5 text-[11px] text-[#78716C] font-medium">
                                            ${item.price.toFixed(2)} each
                                        </p>

                                        {/* Item Modifier / Note Display */}
                                        {item.notes ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNoteModalItem(item)
                                                    setItemNoteText(item.notes || "")
                                                }}
                                                className="mt-1 inline-flex items-center gap-1 rounded bg-[#FEF8EC] border border-[#F7E0B5] px-1.5 py-0.5 text-[10px] font-medium text-[#8C4E08] hover:bg-[#FDF2D9]"
                                            >
                                                <span>↳ {item.notes}</span>
                                            </button>
                                        ) : !reservedOrderId && onUpdateNotes ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setNoteModalItem(item)
                                                    setItemNoteText("")
                                                }}
                                                className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-stone-400 hover:text-[#78350F]"
                                            >
                                                <FileText className="size-2.5" />
                                                <span>+ Modifier / Note</span>
                                            </button>
                                        ) : null}
                                    </div>

                                    {!reservedOrderId && (
                                        <button
                                            type="button"
                                            aria-label={`Remove ${item.name}`}
                                            onClick={() => onRemove?.(item.id)}
                                            className="flex size-6 shrink-0 items-center justify-center rounded-lg text-[#A8A29E] transition-colors hover:bg-[#FDF2F2] hover:text-[#9B2C2C] active:scale-95"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    )}
                                </div>

                                <div className="mt-2.5 flex items-center justify-between">
                                    {/* Stepper */}
                                    <div className="flex items-center rounded-lg border border-[#E8E3DB] bg-white shadow-2xs">
                                        <button
                                            type="button"
                                            disabled={Boolean(reservedOrderId)}
                                            aria-label={`Decrease ${item.name} quantity`}
                                            onClick={() => onDecrease?.(item.id)}
                                            className="flex size-7 items-center justify-center text-[#57534E] transition-colors hover:bg-[#FAF8F5] hover:text-[#1C1917] disabled:cursor-not-allowed disabled:opacity-30 active:scale-90"
                                        >
                                            <Minus className="size-3 stroke-[2.5]" />
                                        </button>

                                        <span className="tnum flex min-w-7 justify-center text-xs font-bold text-[#1C1917]">
                                            {item.quantity}
                                        </span>

                                        <button
                                            type="button"
                                            disabled={Boolean(reservedOrderId)}
                                            aria-label={`Increase ${item.name} quantity`}
                                            onClick={() => onIncrease?.(item.id)}
                                            className="flex size-7 items-center justify-center text-[#57534E] transition-colors hover:bg-[#FAF8F5] hover:text-[#1C1917] disabled:cursor-not-allowed disabled:opacity-30 active:scale-90"
                                        >
                                            <Plus className="size-3 stroke-[2.5]" />
                                        </button>
                                    </div>

                                    {/* Line total */}
                                    <p className="tnum text-xs font-extrabold text-[#1C1917]">
                                        ${(item.price * item.quantity).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Receipt Summary Footer */}
                    <div className="border-t border-[#E8E3DB] bg-[#FAF8F5] p-4 shadow-xs">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-medium text-[#78716C]">
                                <span>Subtotal</span>
                                <span className="tnum font-semibold text-[#1C1917]">
                                    ${subtotal.toFixed(2)}
                                </span>
                            </div>

                            {/* Discount Line */}
                            {discountPercent > 0 ? (
                                <div className="flex items-center justify-between text-xs font-medium text-[#8C4E08]">
                                    <span>Discount ({discountPercent}% · {discountReason || "Special"}):</span>
                                    <span className="tnum font-bold">
                                        -${discountAmount.toFixed(2)}
                                    </span>
                                </div>
                            ) : !reservedOrderId && onApplyDiscount && (
                                <div className="flex items-center justify-between">
                                    <button
                                        type="button"
                                        onClick={() => setDiscountModalOpen(true)}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-[#78350F]"
                                    >
                                        <Percent className="size-3" />
                                        <span>Add Discount / Comp</span>
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center justify-between text-xs font-medium text-[#78716C]">
                                <span>Tax</span>
                                <span className="text-[11px] font-medium text-[#4E6047]">
                                    Included (10%)
                                </span>
                            </div>

                            <div className="flex items-center justify-between border-t border-[#E8E3DB] pt-2">
                                <span className="font-serif-brand text-sm font-bold text-[#1C1917]">
                                    Total
                                </span>
                                <span className="tnum text-xl font-extrabold tracking-tight text-[#1C1917]">
                                    ${finalTotal.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        {/* Checkout CTA */}
                        {reservedOrderId ? (
                            <button
                                type="button"
                                className="mt-3.5 h-10 w-full rounded-xl bg-[#FEF8EC] border border-[#F7E0B5] text-[#8C4E08] font-bold text-xs shadow-xs cursor-not-allowed flex items-center justify-center gap-2"
                                disabled
                            >
                                <span className="size-2 rounded-full bg-[#B45309] animate-pulse" />
                                Order #{reservedOrderId} · Awaiting Payment
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="mt-3.5 flex h-10.5 w-full items-center justify-center gap-2 rounded-xl bg-[#78350F] text-white font-bold text-xs shadow-sm hover:bg-[#5A270B] transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                                onClick={onCheckout}
                                disabled={isCheckingOut}
                            >
                                {isCheckingOut ? (
                                    <>
                                        <Loader2 className="size-4 animate-spin text-white" />
                                        <span>Holding items...</span>
                                    </>
                                ) : (
                                    <span>Complete Sale (${finalTotal.toFixed(2)})</span>
                                )}
                            </button>
                        )}

                        <p className="mt-2 text-center text-[10px] text-[#A8A29E]">
                            {reservedOrderId
                                ? `Order #${reservedOrderId} is held for payment.`
                                : "Items are held for 5 minutes once payment begins."}
                        </p>
                    </div>
                </>
            )}

            {/* Park Order Modal */}
            {parkModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl border border-[#E8E3DB]">
                        <h4 className="font-serif-brand text-sm font-bold text-[#1C1917]">
                            Hold / Park Order
                        </h4>
                        <p className="mt-0.5 text-xs text-stone-500">
                            Tag this order to serve another customer.
                        </p>
                        <input
                            type="text"
                            value={parkLabel}
                            onChange={(e) => setParkLabel(e.target.value)}
                            placeholder="e.g. Table 4, or Customer Bob"
                            className="mt-3 w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] px-3 py-2 text-xs font-medium text-[#1C1917] focus:border-[#78350F] focus:outline-hidden"
                            autoFocus
                        />
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setParkModalOpen(false)}
                                className="flex-1 rounded-xl border border-[#E8E3DB] py-2 text-xs font-bold text-stone-600 hover:bg-stone-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmPark}
                                disabled={!parkLabel.trim()}
                                className="flex-1 rounded-xl bg-[#78350F] py-2 text-xs font-bold text-white shadow-xs hover:bg-[#5A270B] disabled:opacity-50"
                            >
                                Park Order
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Discount Modal */}
            {discountModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl border border-[#E8E3DB]">
                        <h4 className="font-serif-brand text-sm font-bold text-[#1C1917]">
                            Apply Discount
                        </h4>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {["10", "15", "20", "50", "100"].map((pct) => (
                                <button
                                    key={pct}
                                    type="button"
                                    onClick={() => {
                                        setSelectedDiscount(pct)
                                        setCustomReason(pct === "100" ? "Manager Comp" : `${pct}% Discount`)
                                    }}
                                    className={`rounded-xl border py-2 text-xs font-bold transition-all ${
                                        selectedDiscount === pct
                                            ? "border-[#78350F] bg-[#FEF8EC] text-[#78350F]"
                                            : "border-[#E8E3DB] text-stone-700 hover:bg-stone-50"
                                    }`}
                                >
                                    {pct}%
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            value={customReason}
                            onChange={(e) => setCustomReason(e.target.value)}
                            placeholder="Discount reason (e.g. Staff, VIP)"
                            className="mt-3 w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] px-3 py-2 text-xs font-medium text-[#1C1917] focus:border-[#78350F] focus:outline-hidden"
                        />
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setDiscountModalOpen(false)}
                                className="flex-1 rounded-xl border border-[#E8E3DB] py-2 text-xs font-bold text-stone-600 hover:bg-stone-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDiscount}
                                className="flex-1 rounded-xl bg-[#78350F] py-2 text-xs font-bold text-white shadow-xs hover:bg-[#5A270B]"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Note / Modifier Modal */}
            {noteModalItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl border border-[#E8E3DB]">
                        <h4 className="font-serif-brand text-sm font-bold text-[#1C1917]">
                            {noteModalItem.name} Modifiers
                        </h4>
                        <p className="mt-0.5 text-xs text-stone-500">
                            Custom notes, dairy alternative, or prep details.
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {["Oat Milk", "Almond Milk", "Extra Shot", "Decaf", "Sugar Free", "Extra Hot"].map(
                                (preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() =>
                                            setItemNoteText((curr) =>
                                                curr ? `${curr}, ${preset}` : preset,
                                            )
                                        }
                                        className="rounded-lg border border-[#E8E3DB] bg-[#FAF8F5] px-2 py-1 text-[10px] font-semibold text-stone-700 hover:bg-stone-100"
                                    >
                                        +{preset}
                                    </button>
                                ),
                            )}
                        </div>
                        <input
                            type="text"
                            value={itemNoteText}
                            onChange={(e) => setItemNoteText(e.target.value)}
                            placeholder="e.g. Oat milk, light ice"
                            className="mt-3 w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] px-3 py-2 text-xs font-medium text-[#1C1917] focus:border-[#78350F] focus:outline-hidden"
                            autoFocus
                        />
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setNoteModalItem(null)}
                                className="flex-1 rounded-xl border border-[#E8E3DB] py-2 text-xs font-bold text-stone-600 hover:bg-stone-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveNote}
                                className="flex-1 rounded-xl bg-[#78350F] py-2 text-xs font-bold text-white shadow-xs hover:bg-[#5A270B]"
                            >
                                Save Note
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}
