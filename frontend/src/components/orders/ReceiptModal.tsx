import { Coffee, Printer, X } from "lucide-react"
import type { Order } from "../../lib/api"

type ReceiptModalProps = {
    order: Order | null
    isOpen: boolean
    onClose: () => void
}

export function ReceiptModal({ order, isOpen, onClose }: ReceiptModalProps) {
    if (!isOpen || !order) return null

    const handlePrint = () => {
        window.print()
    }

    const subtotal = order.items.reduce(
        (sum, item) => sum + Number(item.unit_price) * item.quantity,
        0,
    )
    const discount = Number(order.discount_amount || 0)
    const finalTotal = Math.max(0, subtotal - discount)
    const taxIncluded = (finalTotal * 0.1) / 1.1

    const payment = order.payment
    const isCash = payment?.method === "cash"
    const tendered = payment?.amount_tendered ? Number(payment.amount_tendered) : null
    const change = payment?.change_due ? Number(payment.change_due) : null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="relative flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-[#E8E3DB]">
                {/* Modal action bar (hidden during print) */}
                <div className="flex items-center justify-between border-b border-[#E8E3DB] bg-[#FAF8F5] px-4 py-3 print:hidden">
                    <div className="flex items-center gap-2">
                        <Printer className="size-4 text-[#78350F]" />
                        <span className="text-xs font-bold text-[#1C1917]">Receipt Preview</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#78350F] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#5A270B] active:scale-95 transition-all"
                        >
                            <Printer className="size-3.5" />
                            Print
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex size-7 items-center justify-center rounded-lg text-[#78716C] hover:bg-[#F5F1EA] hover:text-[#1C1917]"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>

                {/* Printable receipt ticket */}
                <div className="overflow-y-auto p-6 font-mono text-xs text-[#1C1917] print:p-0">
                    <div className="text-center">
                        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-[#FAF8F5] text-[#78350F] border border-[#E8E3DB] mb-2">
                            <Coffee className="size-5" />
                        </div>
                        <h2 className="text-sm font-bold uppercase tracking-wider">Artisan Café</h2>
                        <p className="text-[11px] text-stone-500">Specialty Coffee & Roastery</p>
                        <p className="text-[10px] text-stone-400">104 Artisan Way · City Center</p>
                        <div className="my-3 border-b border-dashed border-stone-300" />
                    </div>

                    <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                            <span className="text-stone-500">Order:</span>
                            <span className="font-bold">#{order.id}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-stone-500">Date:</span>
                            <span>{new Date(order.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-stone-500">Cashier:</span>
                            <span>{order.handled_by?.display_name || "POS"}</span>
                        </div>
                        {order.table_or_customer && (
                            <div className="flex justify-between">
                                <span className="text-stone-500">Tag / Table:</span>
                                <span className="font-bold text-[#78350F]">{order.table_or_customer}</span>
                            </div>
                        )}
                    </div>

                    <div className="my-3 border-b border-dashed border-stone-300" />

                    {/* Items table */}
                    <div className="space-y-2">
                        {order.items.map((item, idx) => (
                            <div key={idx}>
                                <div className="flex justify-between font-semibold">
                                    <span>
                                        {item.quantity}x {item.product_name}
                                    </span>
                                    <span>${(Number(item.unit_price) * item.quantity).toFixed(2)}</span>
                                </div>
                                {item.notes && (
                                    <p className="text-[10px] text-[#8C4E08] italic pl-4">
                                        ↳ {item.notes}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="my-3 border-b border-dashed border-stone-300" />

                    {/* Totals */}
                    <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                            <span className="text-stone-500">Subtotal:</span>
                            <span>${subtotal.toFixed(2)}</span>
                        </div>
                        {discount > 0 && (
                            <div className="flex justify-between text-[#8C4E08] font-semibold">
                                <span>Discount ({order.discount_percent}%):</span>
                                <span>-${discount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-stone-500">
                            <span>Tax (10% Incl.):</span>
                            <span>${taxIncluded.toFixed(2)}</span>
                        </div>
                        <div className="my-1 border-b border-stone-300" />
                        <div className="flex justify-between text-sm font-bold">
                            <span>TOTAL:</span>
                            <span>${finalTotal.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="my-3 border-b border-dashed border-stone-300" />

                    {/* Payment details */}
                    <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                            <span className="text-stone-500">Payment Tender:</span>
                            <span className="font-bold uppercase">{isCash ? "CASH" : "CARD"}</span>
                        </div>
                        {isCash && tendered !== null && (
                            <>
                                <div className="flex justify-between">
                                    <span className="text-stone-500">Cash Received:</span>
                                    <span>${tendered.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-[#215A36]">
                                    <span>Change Due:</span>
                                    <span>${(change ?? 0).toFixed(2)}</span>
                                </div>
                            </>
                        )}
                        {!isCash && payment?.reference_id && (
                            <div className="flex justify-between">
                                <span className="text-stone-500">Auth Ref:</span>
                                <span>{payment.reference_id}</span>
                            </div>
                        )}
                    </div>

                    <div className="mt-5 text-center text-[10px] text-stone-400">
                        <p>Thank you for supporting artisan coffee!</p>
                        <p>www.artisancafepos.internal</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

