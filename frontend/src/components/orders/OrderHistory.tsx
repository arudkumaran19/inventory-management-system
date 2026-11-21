import { useEffect, useMemo, useState } from "react"
import { Toast } from "../ui/Toast"
import {
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    Clock3,
    DollarSign,
    Download,
    Loader2,
    Package,
    Printer,
    RefreshCw,
    Search,
    User,
    UserCheck,
    XCircle,
} from "lucide-react"

import { useAuth } from "../../context/AuthContext"
import {
    cancelOrder,
    getOrderExportCsvUrl,
    getOrders,
    getUsers,
    type HandledBy,
    type Order,
} from "../../lib/api"
import type { User as ApiUser } from "../../types/auth"
import { ReceiptModal } from "./ReceiptModal"

type OrderHistoryProps = {
    onInventoryRefresh?: () => void
}

function getStatusClasses(status: string) {
    switch (status) {
        case "Paid":
            return "bg-[#EDF6EE] text-[#215A36] border-[#C8E3CE]"
        case "Reserved":
            return "bg-[#FEF8EC] text-[#8C4E08] border-[#F7E0B5]"
        case "Failed":
            return "bg-[#FDF2F2] text-[#9B2C2C] border-[#F8C8C8]"
        case "Expired":
        case "Cancelled":
        default:
            return "bg-[#F5F1EA] text-[#78716C] border-[#E8E3DB]"
    }
}

function getStatusIcon(status: string) {
    switch (status) {
        case "Paid":
            return CheckCircle2
        case "Reserved":
            return Clock3
        case "Failed":
        case "Cancelled":
            return XCircle
        default:
            return Clock3
    }
}

function getOrderTotal(order: Order) {
    return order.items.reduce(
        (total, item) => total + Number(item.unit_price) * item.quantity,
        0,
    )
}

function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(value)
}

function formatHandledBy(handler: HandledBy | null | undefined): string {
    if (!handler) return "POS"
    return handler.display_name
}

function formatHandledByWithRole(handler: HandledBy | null | undefined): string {
    if (!handler) return "POS"
    const role = handler.role === "admin" ? "Admin" : handler.role.charAt(0).toUpperCase() + handler.role.slice(1)
    return `${handler.display_name} (${role})`
}

function formatTime(iso: string | null | undefined): string {
    if (!iso) return ""
    return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    })
}

function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return ""
    return new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    })
}

function getOrderTimestamp(
    order: Order,
): { label: string; iso: string } {
    switch (order.status) {
        case "Paid":
            return { label: "Settled", iso: order.completed_at ?? order.created_at }
        case "Cancelled":
            return { label: "Cancelled", iso: order.completed_at ?? order.created_at }
        case "Expired":
            return { label: "Expired", iso: order.completed_at ?? order.created_at }
        case "Failed":
            return { label: "Failed", iso: order.completed_at ?? order.created_at }
        default:
            return { label: "Staged", iso: order.created_at }
    }
}

export function OrderHistory({
    onInventoryRefresh,
}: OrderHistoryProps) {
    const { user, isManager } = useAuth()
    const [orders, setOrders] = useState<Order[]>([])
    const [selectedOrderId, setSelectedOrderId] =
        useState<number | null>(null)

    const [statusFilter, setStatusFilter] = useState<string>("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)
    const [employees, setEmployees] = useState<ApiUser[]>([])

    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [cancelling, setCancelling] = useState(false)
    const [cancelMessage, setCancelMessage] =
        useState<string | null>(null)
    const [confirmCancelId, setConfirmCancelId] =
        useState<number | null>(null)
    const [receiptModalOrder, setReceiptModalOrder] = useState<Order | null>(null)
    const [showReceiptModal, setShowReceiptModal] = useState(false)

    // Load active staff members for manager employee filter
    useEffect(() => {
        if (!isManager) return
        let ignore = false
        getUsers()
            .then((users) => {
                if (!ignore) {
                    setEmployees(users.filter((u) => u.is_active))
                }
            })
            .catch(() => {
                // Ignore transient errors
            })
        return () => {
            ignore = true
        }
    }, [isManager])

    const loadOrders = async (isRefresh = false, empId = selectedEmployeeId) => {
        try {
            if (isRefresh) {
                setRefreshing(true)
            } else {
                setLoading(true)
            }

            setError(null)
            const response = await getOrders(empId, statusFilter)
            setOrders(response)

            if (
                selectedOrderId !== null &&
                !response.some((order) => order.id === selectedOrderId)
            ) {
                setSelectedOrderId(null)
            }
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to load sales history.",
            )
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        let ignore = false

        const fetchLatest = (isInitial = false) => {
            getOrders(selectedEmployeeId, statusFilter)
                .then((response) => {
                    if (!ignore) {
                        setOrders(response)
                        if (isInitial) {
                            setLoading(false)
                        }
                    }
                })
                .catch((requestError) => {
                    if (!ignore) {
                        if (isInitial) {
                            setError(
                                requestError instanceof Error
                                    ? requestError.message
                                    : "Unable to load sales history.",
                            )
                            setLoading(false)
                        }
                    }
                })
        }

        fetchLatest(true)

        // Silent auto-refresh orders every 4s
        const intervalId = setInterval(() => fetchLatest(false), 4000)
        const onFocus = () => fetchLatest(false)
        window.addEventListener("focus", onFocus)

        return () => {
            ignore = true
            clearInterval(intervalId)
            window.removeEventListener("focus", onFocus)
        }
    }, [selectedEmployeeId, statusFilter])

    const selectedOrder = useMemo(
        () => orders.find((order) => order.id === selectedOrderId) ?? null,
        [orders, selectedOrderId],
    )

    // Summary statistics
    const stats = useMemo(() => {
        const totalCount = orders.length
        const paidOrders = orders.filter((o) => o.status === "Paid")
        const paidCount = paidOrders.length
        const reservedCount = orders.filter((o) => o.status === "Reserved").length
        const totalRevenue = paidOrders.reduce((sum, o) => sum + getOrderTotal(o), 0)

        return {
            totalCount,
            paidCount,
            reservedCount,
            totalRevenue,
        }
    }, [orders])

    // Filtered orders list
    const filteredOrders = useMemo(() => {
        return orders.filter((order) => {
            const matchesStatus =
                statusFilter === "all" ||
                order.status.toLowerCase() === statusFilter.toLowerCase()

            const query = searchQuery.trim().toLowerCase()
            const matchesQuery =
                !query ||
                String(order.id).includes(query) ||
                order.items.some((item) =>
                    item.product_name?.toLowerCase().includes(query),
                )

            return matchesStatus && matchesQuery
        })
    }, [orders, statusFilter, searchQuery])

    const handleCancel = async () => {
        if (
            selectedOrder === null ||
            cancelling ||
            !["Reserved", "Paid"].includes(selectedOrder.status)
        ) {
            return
        }

        if (confirmCancelId !== selectedOrder.id) {
            setConfirmCancelId(selectedOrder.id)
            return
        }

        try {
            setCancelling(true)
            setCancelMessage(null)
            setError(null)

            await cancelOrder(selectedOrder.id)

            setCancelMessage(
                `Order #${selectedOrder.id} cancelled. Items returned to stock.`,
            )

            setConfirmCancelId(null)
            await loadOrders(true)
            onInventoryRefresh?.()
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to cancel order.",
            )
        } finally {
            setCancelling(false)
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#FAF8F5]">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-[#78716C]">
                    <Loader2 className="size-5 animate-spin text-[#78350F]" />
                    Loading sales history...
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-[calc(100vh-4rem)] bg-[#FAF8F5]">
            <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
                {/* Page Title & Refresh */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <ClipboardList className="size-5 text-[#78350F]" />
                            <h1 className="font-serif-brand text-2xl font-bold tracking-tight text-[#1C1917]">
                                Sales History
                            </h1>
                        </div>

                        <p className="mt-0.5 text-xs text-[#78716C] font-medium">
                            View past orders, receipts, and order statuses.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <a
                            href={getOrderExportCsvUrl(selectedEmployeeId, statusFilter)}
                            download="artisan_cafe_orders.csv"
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3.5 text-xs font-bold text-[#78350F] shadow-2xs hover:bg-[#FEF8EC] active:scale-95 transition-all"
                        >
                            <Download className="size-3.5" />
                            Export CSV
                        </a>
                        <button
                            type="button"
                            onClick={() => void loadOrders(true)}
                            disabled={refreshing}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-3.5 text-xs font-bold text-[#1C1917] shadow-2xs hover:bg-[#FAF8F5] disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 transition-all"
                        >
                            <RefreshCw
                                className={`size-3.5 ${
                                    refreshing ? "animate-spin text-[#78350F]" : ""
                                }`}
                            />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* KPI Metrics Banner */}
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-2xs">
                        <p className="text-[11px] font-bold tracking-wider text-[#A8A29E] uppercase">
                            Total Orders
                        </p>
                        <p className="tnum mt-1 text-2xl font-extrabold tracking-tight text-[#1C1917]">
                            {stats.totalCount}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[#C8E3CE] bg-[#EDF6EE]/60 p-4 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold tracking-wider text-[#215A36] uppercase">
                                Completed
                            </p>
                            <CheckCircle2 className="size-4 text-[#4E6047]" />
                        </div>
                        <p className="tnum mt-1 text-2xl font-extrabold tracking-tight text-[#215A36]">
                            {stats.paidCount}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[#F7E0B5] bg-[#FEF8EC]/60 p-4 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold tracking-wider text-[#8C4E08] uppercase">
                                On Hold
                            </p>
                            <Clock3 className="size-4 text-[#B45309]" />
                        </div>
                        <p className="tnum mt-1 text-2xl font-extrabold tracking-tight text-[#8C4E08]">
                            {stats.reservedCount}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-2xs">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold tracking-wider text-[#A8A29E] uppercase">
                                Total Sales
                            </p>
                            <DollarSign className="size-4 text-[#78350F]" />
                        </div>
                        <p className="tnum mt-1 text-2xl font-extrabold tracking-tight text-[#1C1917]">
                            {formatCurrency(stats.totalRevenue)}
                        </p>
                    </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
                        <div className="relative min-w-0 flex-1 sm:max-w-xs">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A8A29E]" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Filter by order # or product..."
                                aria-label="Filter orders"
                                className="h-9.5 w-full rounded-xl border border-[#E8E3DB] bg-white pl-9 pr-3 text-xs text-[#1C1917] outline-none placeholder:text-[#A8A29E] focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/15 shadow-2xs"
                            />
                        </div>

                        {/* Employee filter dropdown */}
                        {isManager ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                                <div className="relative flex items-center">
                                    <UserCheck className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#78350F]" />
                                    <select
                                        id="employee-filter"
                                        aria-label="Filter by employee"
                                        value={selectedEmployeeId ?? ""}
                                        onChange={(e) => {
                                            const val = e.target.value
                                            setSelectedEmployeeId(val ? Number(val) : null)
                                        }}
                                        className="h-9.5 rounded-xl border border-[#E8E3DB] bg-white pl-8 pr-8 text-xs font-semibold text-[#1C1917] shadow-2xs outline-none transition hover:border-[#D6CEC4] focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/15 cursor-pointer appearance-none"
                                    >
                                        <option value="">All Employees</option>
                                        {employees.map((emp) => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.display_name} ({emp.role === "admin" ? "Admin" : emp.role.charAt(0).toUpperCase() + emp.role.slice(1)})
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#A8A29E]" />
                                </div>
                                {selectedEmployeeId !== null && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedEmployeeId(null)}
                                        className="text-[11px] font-semibold text-[#78350F] hover:underline cursor-pointer px-1"
                                    >
                                        Reset
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3 py-2 text-xs font-semibold text-[#78716C] shadow-2xs shrink-0">
                                <User className="size-3.5 text-[#78350F]" />
                                <span>My Sales ({user?.display_name || "Cashier"})</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
                        {[
                            { id: "all", label: "All" },
                            { id: "Reserved", label: "Reserved" },
                            { id: "Paid", label: "Paid" },
                            { id: "Expired", label: "Expired" },
                            { id: "Failed", label: "Failed" },
                            { id: "Cancelled", label: "Cancelled" },
                        ].map((tab) => {
                            const active = statusFilter.toLowerCase() === tab.id.toLowerCase()
                            const count =
                                tab.id === "all"
                                    ? orders.length
                                    : orders.filter(
                                          (o) => o.status.toLowerCase() === tab.id.toLowerCase(),
                                      ).length

                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setStatusFilter(tab.id)}
                                    className={[
                                        "inline-flex h-8.5 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all active:scale-95 shrink-0",
                                        active
                                            ? "bg-[#1C1917] text-white shadow-2xs"
                                            : "border border-[#E8E3DB] bg-white text-[#57534E] hover:bg-[#FAF8F5] hover:text-[#1C1917]",
                                    ].join(" ")}
                                >
                                    <span>{tab.label}</span>
                                    <span
                                        className={[
                                            "rounded-full px-1.5 py-0.2 text-[10px]",
                                            active
                                                ? "bg-white/20 text-white"
                                                : "bg-[#F5F1EA] text-[#78716C]",
                                        ].join(" ")}
                                    >
                                        {count}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {cancelMessage && (
                    <div className="rounded-xl border border-[#C8E3CE] bg-[#EDF6EE] px-4 py-3 text-xs font-medium text-[#215A36] shadow-2xs">
                        {cancelMessage}
                    </div>
                )}

                {error && (
                    <div className="rounded-xl border border-[#F8C8C8] bg-[#FDF2F2] px-4 py-3 text-xs font-medium text-[#9B2C2C] shadow-2xs">
                        {error}
                    </div>
                )}

                {/* Orders Content Split View */}
                {filteredOrders.length === 0 ? (
                    <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-[#D8D1C5] bg-white/70 p-8 text-center">
                        <Package className="size-8 text-[#A8A29E]" />
                        <p className="mt-3 font-serif-brand text-sm font-bold text-[#1C1917]">
                            No Orders Found
                        </p>
                        <p className="mt-1 text-xs text-[#78716C]">
                            No orders match your search or filter.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
                        {/* Orders List */}
                        <section className="space-y-3">
                            {filteredOrders.map((order) => {
                                const StatusIcon = getStatusIcon(order.status)
                                const total = getOrderTotal(order)
                                const selected = selectedOrderId === order.id
                                const ts = getOrderTimestamp(order)

                                return (
                                    <button
                                        key={order.id}
                                        type="button"
                                        onClick={() => setSelectedOrderId(order.id)}
                                        className={[
                                            "w-full rounded-2xl border bg-white p-4 text-left shadow-2xs transition-all duration-150 active:scale-[0.99]",
                                            selected
                                                ? "border-[#78350F] ring-2 ring-[#78350F]/20 shadow-xs"
                                                : "border-[#E8E3DB] hover:border-[#D8D1C5] hover:shadow-2xs",
                                        ].join(" ")}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FAF8F5] text-[#78350F] border border-[#E8E3DB]">
                                                <StatusIcon className="size-5" />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="font-serif-brand text-base font-bold text-[#1C1917]">
                                                        Order #{order.id}
                                                    </p>

                                                    <span
                                                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold border ${getStatusClasses(
                                                            order.status,
                                                        )}`}
                                                    >
                                                        {order.status}
                                                    </span>
                                                </div>

                                                <p className="tnum mt-1 text-xs text-[#78716C] font-medium">
                                                    {order.items.length}{" "}
                                                    {order.items.length === 1 ? "item" : "items"}
                                                    {" · "}
                                                    <strong className="text-[#1C1917] font-bold">
                                                        {formatCurrency(total)}
                                                    </strong>
                                                    {" · "}
                                                    {ts.label} {formatTime(ts.iso)}
                                                </p>

                                                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#A8A29E] font-medium">
                                                    <User className="size-3 shrink-0 text-[#78716C]" />
                                                    <span>
                                                        Taken by:{" "}
                                                        <span className={order.handled_by ? "font-semibold text-[#57534E]" : "italic"}>
                                                            {formatHandledBy(order.handled_by)}
                                                        </span>
                                                    </span>
                                                </p>
                                            </div>

                                            <ChevronRight className="size-4 shrink-0 text-[#A8A29E]" />
                                        </div>
                                    </button>
                                )
                            })}
                        </section>

                        {/* Order Detail Drawer */}
                        <aside className="h-fit rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-2xs lg:sticky lg:top-20">
                            {selectedOrder === null ? (
                                <div className="py-16 text-center">
                                    <Package className="mx-auto size-8 text-[#A8A29E]" />
                                    <p className="mt-3 font-serif-brand text-sm font-bold text-[#1C1917]">
                                        Select an Order
                                    </p>
                                    <p className="mt-1 text-xs text-[#78716C]">
                                        Choose any order to view receipt and item details.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-start justify-between gap-4 border-b border-[#E8E3DB] pb-4">
                                        <div>
                                            <p className="text-[10px] font-bold tracking-wider text-[#A8A29E] uppercase">
                                                Receipt
                                            </p>

                                            <h2 className="mt-0.5 font-serif-brand text-xl font-extrabold text-[#1C1917]">
                                                Order #{selectedOrder.id}
                                            </h2>

                                            {/* Timestamp breakdown */}
                                            <div className="mt-1.5 space-y-0.5 text-[11px] text-[#78716C] font-medium">
                                                <p>
                                                    Created:{" "}
                                                    <span className="font-semibold text-[#1C1917]">
                                                        {formatDateTime(selectedOrder.created_at)}
                                                    </span>
                                                </p>

                                                {selectedOrder.completed_at && (
                                                    <p>
                                                        {selectedOrder.status === "Paid"
                                                            ? "Completed: "
                                                            : selectedOrder.status === "Cancelled"
                                                                ? "Cancelled: "
                                                                : selectedOrder.status === "Expired"
                                                                    ? "Expired: "
                                                                    : "Resolved: "}
                                                        <span className="font-semibold text-[#1C1917]">
                                                            {formatDateTime(selectedOrder.completed_at)}
                                                        </span>
                                                    </p>
                                                )}

                                                <p className="flex items-center gap-1.5 pt-0.5">
                                                    <User className="size-3 shrink-0 text-[#78716C]" />
                                                    <span>
                                                        Taken by:{" "}
                                                        <span className="font-semibold text-[#1C1917]">
                                                            {formatHandledByWithRole(selectedOrder.handled_by)}
                                                        </span>
                                                    </span>
                                                </p>
                                            </div>
                                        </div>

                                        <span
                                            className={`rounded-full px-2.5 py-1 text-xs font-bold border ${getStatusClasses(
                                                selectedOrder.status,
                                            )}`}
                                        >
                                            {selectedOrder.status}
                                        </span>
                                    </div>

                                    {/* Items breakdown */}
                                    <div className="mt-4">
                                        <p className="text-[10px] font-bold tracking-wider text-[#A8A29E] uppercase">
                                            Items
                                        </p>

                                        <div className="mt-2.5 divide-y divide-[#E8E3DB]/70">
                                            {selectedOrder.items.map((item) => (
                                                <div
                                                    key={`${selectedOrder.id}-${item.product_id}`}
                                                    className="flex items-center justify-between py-2.5 text-xs"
                                                >
                                                    <div>
                                                        <p className="font-bold text-[#1C1917]">
                                                            {item.product_name}
                                                        </p>
                                                        <p className="tnum text-[11px] text-[#78716C]">
                                                            {item.quantity} × {formatCurrency(Number(item.unit_price))}
                                                        </p>
                                                    </div>

                                                    <p className="tnum font-extrabold text-[#1C1917]">
                                                        {formatCurrency(Number(item.unit_price) * item.quantity)}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Total & Payment details */}
                                    <div className="mt-4 border-t border-[#E8E3DB] pt-3 space-y-1.5">
                                        {Number(selectedOrder.discount_amount || 0) > 0 && (
                                            <div className="flex items-center justify-between text-xs text-[#8C4E08] font-medium">
                                                <span>Discount ({selectedOrder.discount_percent}% · {selectedOrder.discount_reason}):</span>
                                                <span className="font-bold">-${Number(selectedOrder.discount_amount).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between">
                                            <span className="font-serif-brand text-xs font-bold text-[#57534E] uppercase">
                                                Total
                                            </span>
                                            <span className="tnum text-xl font-extrabold text-[#1C1917]">
                                                {formatCurrency(Math.max(0, getOrderTotal(selectedOrder) - Number(selectedOrder.discount_amount || 0)))}
                                            </span>
                                        </div>
                                        {selectedOrder.payment && (
                                            <div className="rounded-xl bg-[#FAF8F5] p-2.5 text-[11px] text-[#78716C] border border-[#E8E3DB] space-y-1">
                                                <div className="flex justify-between font-semibold text-[#1C1917]">
                                                    <span>Payment Tender:</span>
                                                    <span className="uppercase">{selectedOrder.payment.method}</span>
                                                </div>
                                                {selectedOrder.payment.amount_tendered && (
                                                    <div className="flex justify-between">
                                                        <span>Cash Tendered:</span>
                                                        <span>${Number(selectedOrder.payment.amount_tendered).toFixed(2)}</span>
                                                    </div>
                                                )}
                                                {selectedOrder.payment.change_due && (
                                                    <div className="flex justify-between text-[#215A36] font-bold">
                                                        <span>Change Given:</span>
                                                        <span>${Number(selectedOrder.payment.change_due).toFixed(2)}</span>
                                                    </div>
                                                )}
                                                {selectedOrder.payment.reference_id && (
                                                    <div className="flex justify-between">
                                                        <span>Ref ID:</span>
                                                        <span>{selectedOrder.payment.reference_id}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Buttons: Print Receipt & Cancel */}
                                    <div className="mt-4 space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReceiptModalOrder(selectedOrder)
                                                setShowReceiptModal(true)
                                            }}
                                            className="flex h-9.5 w-full items-center justify-center gap-2 rounded-xl border border-[#78350F] bg-white px-3 text-xs font-bold text-[#78350F] hover:bg-[#FEF8EC] active:scale-95 transition-all shadow-2xs"
                                        >
                                            <Printer className="size-4" />
                                            Print Receipt
                                        </button>

                                        {["Reserved", "Paid"].includes(selectedOrder.status) && (
                                        <div className="mt-5 space-y-2 border-t border-[#E8E3DB] pt-4">
                                            {confirmCancelId === selectedOrder.id ? (
                                                <div className="rounded-xl border border-[#F8C8C8] bg-[#FDF2F2] p-3 text-center space-y-2.5">
                                                    <p className="text-xs font-bold text-[#9B2C2C]">
                                                        Cancel this order and return items to stock?
                                                    </p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmCancelId(null)}
                                                            className="h-8.5 rounded-xl border border-[#E8E3DB] bg-white px-3 text-xs font-bold text-[#1C1917] hover:bg-[#FAF8F5] active:scale-95 transition-all shadow-2xs"
                                                        >
                                                            Keep Order
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleCancel()}
                                                            disabled={cancelling}
                                                            className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-xl bg-[#9B2C2C] px-3 text-xs font-bold text-white hover:bg-[#7D2323] disabled:opacity-50 active:scale-95 transition-all shadow-2xs"
                                                        >
                                                            {cancelling && (
                                                                <Loader2 className="size-3.5 animate-spin" />
                                                            )}
                                                            {cancelling ? "Cancelling..." : "Cancel Order"}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCancel()}
                                                    disabled={cancelling}
                                                    className="flex h-9.5 w-full items-center justify-center gap-1.5 rounded-xl border border-[#F8C8C8] bg-white px-3 text-xs font-bold text-[#9B2C2C] hover:bg-[#FDF2F2] disabled:opacity-50 active:scale-95 transition-all shadow-2xs"
                                                >
                                                    Cancel Order
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    </div>
                                </>
                            )}
                        </aside>
                    </div>
                )}
            </div>

            <ReceiptModal
                order={receiptModalOrder}
                isOpen={showReceiptModal}
                onClose={() => setShowReceiptModal(false)}
            />

            <Toast
                message={cancelMessage}
                variant="success"
                duration={5000}
                onClose={() => setCancelMessage(null)}
            />
        </div>
    )
}
