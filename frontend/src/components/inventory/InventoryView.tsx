import { useEffect, useMemo, useState } from "react"
import { Toast } from "../ui/Toast"
import {
    AlertTriangle,
    Archive,
    Barcode,
    Boxes,
    Camera,
    Coffee,
    Edit3,
    History,
    Package,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Trash2,
    X,
} from "lucide-react"
import { IngredientsModal } from "./IngredientsModal"
import { BarcodeScannerModal } from "../common/BarcodeScannerModal"
import { useBarcodeScanner } from "../../hooks/useBarcodeScanner"
import { playScanSound } from "../../lib/sound"
import {
    createProduct,
    deleteProduct,
    getInventoryLogs,
    getProductByBarcode,
    getProducts,
    updateProduct,
    type InventoryLog,
    type Product,
} from "../../lib/api"

type ProductForm = {
    name: string
    price: string
    available_stock: string
    category: string
    barcode: string
    adjustment_reason: string
}

const emptyForm: ProductForm = {
    name: "",
    price: "",
    available_stock: "",
    category: "Coffee",
    barcode: "",
    adjustment_reason: "Supplier Delivery",
}

function getStockLabel(stock: number) {
    if (stock === 0) return "Out of stock"
    if (stock <= 5) return "Running low"
    return "In stock"
}

function getStockClasses(stock: number) {
    if (stock === 0) {
        return "bg-rose-50 text-rose-700 ring-rose-200 border-rose-200"
    }

    if (stock <= 5) {
        return "bg-amber-50 text-amber-700 ring-amber-200 border-amber-200"
    }

    return "bg-emerald-50 text-emerald-700 ring-emerald-200 border-emerald-200"
}

function formatPrice(price: string) {
    const numericPrice = Number(price)

    if (Number.isNaN(numericPrice)) {
        return price
    }

    return `$${numericPrice.toFixed(2)}`
}

export function InventoryView() {
    const [products, setProducts] = useState<Product[]>([])
    const [search, setSearch] = useState("")
    type InventoryStatusFilter = "all" | "active" | "archived"

    const [statusFilter, setStatusFilter] =
        useState<InventoryStatusFilter>("all")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<number | null>(null)
    const [archivingId, setArchivingId] = useState<number | null>(null)

    const [error, setError] = useState("")
    const [successMessage, setSuccessMessage] = useState("")

    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null)
    const [form, setForm] = useState<ProductForm>(emptyForm)
    const [formError, setFormError] = useState("")
    const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([])
    const [isLogsModalOpen, setIsLogsModalOpen] = useState(false)
    const [logsLoading, setLogsLoading] = useState(false)
    const [isIngredientsModalOpen, setIsIngredientsModalOpen] = useState(false)
    const [isInventoryScannerOpen, setIsInventoryScannerOpen] = useState(false)
    const [isCameraScanningForm, setIsCameraScanningForm] = useState(false)

    async function handleBarcodeLookup(scannedCode: string) {
        const cleaned = scannedCode.trim()
        if (!cleaned) return

        // Normalize if digits with spaces (e.g. retail box "0 12345 67890 5")
        const noSpaces = cleaned.replace(/\s+/g, "")
        const searchCode =
            /^\d+$/.test(noSpaces) && noSpaces.length >= 3 ? noSpaces : cleaned

        // If form modal is open, fill the form barcode field
        if (isFormOpen) {
            setForm((current) => ({
                ...current,
                barcode: searchCode,
            }))
            playScanSound("success")
            setSuccessMessage(`Scanned barcode: ${searchCode}`)
            return
        }

        // Look up product in products list or server
        let matched = products.find(
            (p) =>
                p.barcode &&
                (p.barcode.toLowerCase() === cleaned.toLowerCase() ||
                    p.barcode.toLowerCase() === searchCode.toLowerCase()),
        )

        if (!matched) {
            try {
                matched = await getProductByBarcode(searchCode)
            } catch {
                try {
                    matched = await getProductByBarcode(cleaned)
                } catch {
                    // Not found
                }
            }
        }

        if (matched) {
            playScanSound("success")
            setSuccessMessage(`Identified "${matched.name}". Ready for stock adjustment.`)
            openEditForm(matched)
        } else {
            // Real-world practical workflow: If barcode doesn't exist yet, seamlessly
            // open the Add Product modal with the scanned barcode pre-filled!
            playScanSound("success")
            setSuccessMessage(
                `New barcode "${searchCode}" detected. Enter product details to add it to inventory.`,
            )
            openCreateFormWithBarcode(searchCode)
        }
    }

    // Hardware USB/Bluetooth barcode scanner listener
    useBarcodeScanner({
        onScan: (barcode) => {
            void handleBarcodeLookup(barcode)
        },
        enabled: true,
    })

    async function loadLogs() {
        try {
            setLogsLoading(true)
            const data = await getInventoryLogs()
            setInventoryLogs(data)
        } catch {
            // ignore
        } finally {
            setLogsLoading(false)
        }
    }

    async function loadProducts() {
        setLoading(true)
        setError("")

        try {
            const data = await getProducts()
            setProducts(data)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to load products.",
            )
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        let ignore = false

        const fetchLatest = (isInitial = false) => {
            getProducts()
                .then((data) => {
                    if (!ignore) {
                        setProducts(data)
                        if (isInitial) {
                            setLoading(false)
                        }
                    }
                })
                .catch((err) => {
                    if (!ignore) {
                        if (isInitial) {
                            setError(
                                err instanceof Error
                                    ? err.message
                                    : "Unable to load products.",
                            )
                            setLoading(false)
                        }
                    }
                })
        }

        fetchLatest(true)

        // Silent auto-refresh every 4 seconds and on focus so stock reservations and expirations update live
        const intervalId = setInterval(() => fetchLatest(false), 4000)
        const onFocus = () => fetchLatest(false)
        window.addEventListener("focus", onFocus)

        return () => {
            ignore = true
            clearInterval(intervalId)
            window.removeEventListener("focus", onFocus)
        }
    }, [])

    const filteredProducts = useMemo(() => {
        const query = search.trim().toLowerCase()
        const queryNoSpaces = query.replace(/\s+/g, "")

        return products.filter((product) => {
            const matchesSearch =
                !query ||
                product.name.toLowerCase().includes(query) ||
                (product.barcode &&
                    (product.barcode.toLowerCase().includes(query) ||
                        product.barcode.toLowerCase().includes(queryNoSpaces)))

            const matchesStatus =
                statusFilter === "all"
                    ? true
                    : statusFilter === "active"
                        ? product.is_active
                        : !product.is_active

            return matchesSearch && matchesStatus
        })
    }, [products, search, statusFilter])

    const activeProducts = useMemo(
        () => products.filter((product) => product.is_active),
        [products],
    )

    const archivedProducts = useMemo(
        () => products.filter((product) => !product.is_active),
        [products],
    )

    const activeStock = useMemo(
        () =>
            activeProducts.reduce(
                (total, product) => total + product.available_stock,
                0,
            ),
        [activeProducts],
    )

    const lowStockCount = useMemo(
        () =>
            activeProducts.filter(
                (product) =>
                    product.available_stock > 0 &&
                    product.available_stock <= 5,
            ).length,
        [activeProducts],
    )

    const outOfStockCount = useMemo(
        () =>
            activeProducts.filter(
                (product) => product.available_stock === 0,
            ).length,
        [activeProducts],
    )

    function openCreateForm() {
        setEditingProduct(null)
        setForm(emptyForm)
        setFormError("")
        setIsFormOpen(true)
    }

    function openCreateFormWithBarcode(barcode: string) {
        setEditingProduct(null)
        setForm({
            ...emptyForm,
            barcode,
        })
        setFormError("")
        setIsFormOpen(true)
    }

    function openEditForm(product: Product) {
        setEditingProduct(product)

        setForm({
            name: product.name,
            price: product.price,
            available_stock: String(product.available_stock),
            category: product.category || "Coffee",
            barcode: product.barcode || "",
            adjustment_reason: "Inventory Recount",
        })

        setFormError("")
        setIsFormOpen(true)
    }

    function closeForm() {
        if (saving) return

        setIsFormOpen(false)
        setEditingProduct(null)
        setForm(emptyForm)
        setFormError("")
    }

    function updateForm(
        field: keyof ProductForm,
        value: string,
    ) {
        setForm((current) => ({
            ...current,
            [field]: value,
        }))

        setFormError("")
    }

    function validateForm() {
        const name = form.name.trim()
        const price = Number(form.price)
        const stock = Number(form.available_stock)
        const barcode = form.barcode.trim()

        if (!name) {
            return "Enter a product name."
        }

        if (!Number.isFinite(price) || price <= 0) {
            return "Enter a valid price above $0."
        }

        if (!Number.isInteger(stock) || stock < 0) {
            return "Enter a whole number for stock."
        }

        if (barcode) {
            if (barcode.length < 1 || barcode.length > 64) {
                return "Barcode must be between 1 and 64 characters."
            }
        }

        return null
    }

    async function handleSubmit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault()

        const validationError = validateForm()

        if (validationError) {
            setFormError(validationError)
            return
        }

        setSaving(true)
        setFormError("")
        setError("")
        setSuccessMessage("")

        try {
            const rawBarcode = form.barcode.trim()
            const digitsNoSpaces = rawBarcode.replace(/\s+/g, "")
            const cleanBarcode =
                /^\d+$/.test(digitsNoSpaces) && digitsNoSpaces.length >= 3
                    ? digitsNoSpaces
                    : rawBarcode

            const payload = {
                name: form.name.trim(),
                price: Number(form.price),
                available_stock: Number(form.available_stock),
                category: form.category || "Coffee",
                barcode: cleanBarcode || undefined,
                adjustment_reason: form.adjustment_reason || undefined,
            }

            if (editingProduct) {
                await updateProduct(editingProduct.id, payload)

                setSuccessMessage(
                    `Product "${payload.name}" updated.`,
                )
            } else {
                await createProduct(payload)

                setSuccessMessage(
                    `Product "${payload.name}" added.`,
                )
            }

            setIsFormOpen(false)
            setEditingProduct(null)
            setForm(emptyForm)

            await loadProducts()
        } catch (err) {
            setFormError(
                err instanceof Error
                    ? err.message
                    : "Unable to save the product.",
            )
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(product: Product) {
        const confirmed = window.confirm(
            `Delete "${product.name}"?\n\nThis action cannot be undone.`,
        )

        if (!confirmed) return

        setDeletingId(product.id)
        setError("")
        setSuccessMessage("")

        try {
            await deleteProduct(product.id)

            setProducts((current) =>
                current.filter(
                    (item) => item.id !== product.id,
                ),
            )

            setSuccessMessage(
                `Product "${product.name}" deleted.`,
            )
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to delete the product.",
            )
        } finally {
            setDeletingId(null)
        }
    }

    async function handleArchiveToggle(product: Product) {
        const nextIsActive = !product.is_active
        const action = nextIsActive ? "restore" : "archive"

        const confirmed = window.confirm(
            nextIsActive
                ? `Restore "${product.name}"?\n\nThis will make the product available on the menu again.`
                : `Archive "${product.name}"?\n\nThis will hide the product from the menu, but keep its history.`,
        )

        if (!confirmed) return

        setArchivingId(product.id)
        setError("")
        setSuccessMessage("")

        try {
            await updateProduct(product.id, {
                is_active: nextIsActive,
            })

            setProducts((current) =>
                current.map((item) =>
                    item.id === product.id
                        ? {
                            ...item,
                            is_active: nextIsActive,
                        }
                        : item,
                ),
            )

            setSuccessMessage(
                nextIsActive
                    ? `Product "${product.name}" restored.`
                    : `Product "${product.name}" archived.`,
            )
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : `Unable to ${action} the product.`,
            )
        } finally {
            setArchivingId(null)
        }
    }

    return (
        <div className="p-6 lg:p-8 space-y-6">
            <div className="mx-auto max-w-7xl">
                {/* Header with Title and Quick Actions */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                <Package className="size-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <h1 className="font-serif-brand text-2xl font-medium tracking-tight text-[#1C1917]">
                                        Stock
                                    </h1>
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDF6EE] px-2.5 py-0.5 text-xs font-medium text-[#4E6047] border border-[#CFDFCF]">
                                        <span className="size-1.5 rounded-full bg-[#4E6047] animate-pulse" />
                                        Updated live
                                    </span>
                                </div>
                                <p className="text-xs text-[#78716C] mt-0.5">
                                    Manage products, prices, and available quantities.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => setIsIngredientsModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1C1917] shadow-xs hover:bg-[#FAF8F5] hover:border-[#D6CEC4] transition-all cursor-pointer"
                        >
                            <Coffee className="size-3.5 text-[#78350F]" />
                            BOM Ingredients
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                void loadLogs()
                                setIsLogsModalOpen(true)
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1C1917] shadow-xs hover:bg-[#FAF8F5] hover:border-[#D6CEC4] transition-all cursor-pointer"
                        >
                            <History className="size-3.5 text-[#78350F]" />
                            Stock Changes
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsInventoryScannerOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#78350F] shadow-xs hover:bg-[#FEF8EC] hover:border-[#F2DEBA] transition-all cursor-pointer"
                        >
                            <Barcode className="size-3.5 text-[#78350F]" />
                            Scan Barcode
                        </button>

                        <button
                            type="button"
                            onClick={() => void loadProducts()}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1C1917] shadow-xs hover:bg-[#FAF8F5] hover:border-[#D6CEC4] transition-all disabled:opacity-50 cursor-pointer"
                        >
                            <RefreshCw
                                className={[
                                    "size-3.5",
                                    loading ? "animate-spin text-[#78350F]" : "text-[#78716C]",
                                ].join(" ")}
                            />
                            Refresh
                        </button>

                        <button
                            type="button"
                            onClick={openCreateForm}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#78350F] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#5C2B09] transition-all cursor-pointer active:scale-98"
                        >
                            <Plus className="size-4 text-[#FDE68A]" />
                            Add Product
                        </button>
                    </div>
                </div>

                {/* KPI Metrics Dashboard Cards */}
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {/* Active Products */}
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Active Products</span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-[#EDF6EE] text-[#4E6047] border border-[#CFDFCF]">
                                <Package className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">
                                {activeProducts.length}
                            </span>
                            <span className="text-xs text-[#A8A29E]">items</span>
                        </div>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Available on the menu
                        </p>
                    </div>

                    {/* Archived Products */}
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Archived</span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-[#F5F2EB] text-[#78716C] border border-[#E8E3DB]">
                                <Archive className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">
                                {archivedProducts.length}
                            </span>
                            <span className="text-xs text-[#A8A29E]">items</span>
                        </div>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Hidden from menu
                        </p>
                    </div>

                    {/* Total Active Units */}
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Total Quantity</span>
                            <div className="flex size-8 items-center justify-center rounded-lg bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                <Boxes className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">
                                {activeStock}
                            </span>
                            <span className="text-xs text-[#A8A29E]">units</span>
                        </div>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Available for sale
                        </p>
                    </div>

                    {/* Stock Alerts */}
                    <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Running Low &amp; Out</span>
                            <div className={[
                                "flex size-8 items-center justify-center rounded-lg border",
                                lowStockCount + outOfStockCount > 0
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-[#F5F2EB] text-[#78716C] border-[#E8E3DB]",
                            ].join(" ")}>
                                <AlertTriangle className="size-4" />
                            </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                            <span className="font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">
                                {lowStockCount + outOfStockCount}
                            </span>
                            <span className="text-xs text-[#A8A29E]">items</span>
                        </div>
                        <p className="mt-1 text-xs text-[#78716C]">
                            {lowStockCount} running low · {outOfStockCount} out of stock
                        </p>
                    </div>
                </div>

                {/* Main Product Table & Filter Card */}
                <div className="mt-6 overflow-hidden rounded-2xl border border-[#E8E3DB] bg-white shadow-xs">
                    <div className="flex flex-col gap-3 border-b border-[#E8E3DB] p-4 sm:flex-row sm:items-center sm:justify-between bg-[#FAF8F5]/80">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-[#1C1917]">
                                Products
                            </span>
                            <span className="inline-flex items-center rounded-full bg-[#F5F2EB] px-2.5 py-0.5 text-xs font-medium text-[#78716C] border border-[#E8E3DB] tnum">
                                {filteredProducts.length} of {products.length} products
                            </span>
                        </div>

                        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:items-center">
                            {/* Search Input */}
                            <div className="relative w-full sm:w-64">
                                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#A8A29E]" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Search products..."
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-white py-2 pl-9 pr-8 text-xs outline-none transition placeholder:text-[#A8A29E] focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/15"
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch("")}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A8A29E] hover:text-[#1C1917] cursor-pointer"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Status Filter Tabs / Select */}
                            <div className="flex rounded-xl border border-[#E8E3DB] bg-white p-0.5 shadow-2xs">
                                {(
                                    [
                                        { id: "all", label: "All", count: products.length },
                                        { id: "active", label: "Active", count: activeProducts.length },
                                        { id: "archived", label: "Archived", count: archivedProducts.length },
                                    ] as const
                                ).map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setStatusFilter(tab.id)}
                                        className={[
                                            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer",
                                            statusFilter === tab.id
                                                ? "bg-[#78350F] text-white shadow-2xs"
                                                : "text-[#78716C] hover:text-[#1C1917] hover:bg-[#FAF8F5]",
                                        ].join(" ")}
                                    >
                                        <span>{tab.label}</span>
                                        <span className={[
                                            "text-[10px] rounded-full px-1.5 py-0.2 tnum",
                                            statusFilter === tab.id
                                                ? "bg-[#5C2B09] text-amber-200"
                                                : "bg-[#F5F2EB] text-[#78716C]",
                                        ].join(" ")}>
                                            {tab.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Table or Empty States */}
                    {loading ? (
                        <div className="flex min-h-80 items-center justify-center">
                            <div className="text-center">
                                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA] shadow-2xs">
                                    <RefreshCw className="size-6 animate-spin" />
                                </div>
                                <p className="mt-3 text-sm font-semibold text-[#1C1917]">
                                    Loading stock...
                                </p>
                                <p className="mt-1 text-xs text-[#78716C]">
                                    Fetching products and quantities...
                                </p>
                            </div>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex min-h-80 items-center justify-center px-6">
                            <div className="text-center max-w-sm">
                                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#F5F2EB] text-[#A8A29E] border border-[#E8E3DB]">
                                    <Package className="size-7" />
                                </div>

                                <p className="mt-4 font-serif-brand text-lg font-medium text-[#1C1917]">
                                    {search || statusFilter !== "all"
                                        ? "No products found"
                                        : "No products"}
                                </p>

                                <p className="mt-1 text-xs text-[#78716C] leading-relaxed">
                                    {search
                                        ? `No products matched "${search}". Try searching by another keyword or reset the filter.`
                                        : statusFilter === "archived"
                                            ? "There are currently no archived products."
                                            : statusFilter === "active"
                                                ? "There are no active products on the menu."
                                                : "Add your first product to start taking orders."}
                                </p>

                                {(search || statusFilter !== "all") ? (
                                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                        {search.trim() && (
                                            <button
                                                type="button"
                                                onClick={() => openCreateFormWithBarcode(search.trim())}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-[#78350F] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5C2B09] transition cursor-pointer active:scale-98"
                                            >
                                                <Plus className="size-3.5 text-[#FDE68A]" />
                                                Add &quot;{search.trim().length > 20 ? search.trim().slice(0, 20) + "..." : search.trim()}&quot; as Product
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearch("")
                                                setStatusFilter("all")
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] shadow-xs hover:bg-[#FAF8F5] transition cursor-pointer"
                                        >
                                            <X className="size-3.5" />
                                            Clear Search &amp; Filters
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={openCreateForm}
                                        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#78350F] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5C2B09] transition cursor-pointer"
                                    >
                                        <Plus className="size-3.5 text-[#FDE68A]" />
                                        Add Product
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-left">
                                <thead>
                                    <tr className="border-b border-[#E8E3DB] bg-[#F8F5EE] text-[11px] font-semibold uppercase tracking-wider text-[#78716C]">
                                        <th className="px-5 py-3.5">
                                            Product
                                        </th>
                                        <th className="px-5 py-3.5">
                                            Price
                                        </th>
                                        <th className="px-5 py-3.5">
                                            Available Quantity
                                        </th>
                                        <th className="px-5 py-3.5">
                                            Status
                                        </th>
                                        <th className="px-5 py-3.5 text-right">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-[#E8E3DB]/60">
                                    {filteredProducts.map((product) => {
                                        const stockClasses = getStockClasses(product.available_stock)
                                        const stockLabel = getStockLabel(product.available_stock)

                                        return (
                                            <tr
                                                key={product.id}
                                                className="transition-colors hover:bg-[#FAF8F5] group"
                                            >
                                                {/* Product Details */}
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3.5">
                                                        <div className="flex size-10 items-center justify-center rounded-xl bg-[#FEF8EC] border border-[#F2DEBA] text-[#78350F] shadow-2xs font-semibold text-xs shrink-0 font-serif-brand">
                                                            {product.name.slice(0, 2).toUpperCase()}
                                                        </div>

                                                        <div>
                                                            <p className="text-sm font-semibold text-[#1C1917] group-hover:text-[#78350F] transition-colors">
                                                                {product.name}
                                                            </p>
                                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                <span className="text-[11px] font-medium text-[#A8A29E] tnum">
                                                                    ID #{product.id}
                                                                </span>
                                                                {product.barcode && (
                                                                    <>
                                                                        <span className="text-[10px] text-[#D6CEC4]">•</span>
                                                                        <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF8F5] px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[#78716C] border border-[#E8E3DB]" title={`Barcode: ${product.barcode}`}>
                                                                            <Barcode className="size-2.5 text-[#78350F]" />
                                                                            {product.barcode}
                                                                        </span>
                                                                    </>
                                                                )}
                                                                {product.category && (
                                                                    <>
                                                                        <span className="text-[10px] text-[#D6CEC4]">•</span>
                                                                        <span className="inline-flex items-center rounded-md bg-[#FAF8F5] px-1.5 py-0.5 text-[10px] font-medium text-[#78716C] border border-[#E8E3DB]">
                                                                            {product.category}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Price */}
                                                <td className="px-5 py-4">
                                                    <span className="text-sm font-bold text-[#1C1917] tnum">
                                                        {formatPrice(product.price)}
                                                    </span>
                                                </td>

                                                {/* Stock Health */}
                                                <td className="px-5 py-4">
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-baseline gap-1.5">
                                                            <span className={[
                                                                "text-sm font-bold tnum",
                                                                product.available_stock === 0
                                                                    ? "text-rose-600"
                                                                    : product.available_stock <= 5
                                                                        ? "text-amber-700"
                                                                        : "text-[#1C1917]",
                                                            ].join(" ")}>
                                                                {product.available_stock}
                                                            </span>
                                                            <span className="text-xs text-[#A8A29E]">in stock</span>
                                                        </div>

                                                        {/* Visual mini stock bar */}
                                                        <div className="h-1.5 w-28 rounded-full bg-[#E8E3DB] overflow-hidden">
                                                            <div
                                                                className={[
                                                                    "h-full rounded-full transition-all",
                                                                    product.available_stock === 0
                                                                        ? "bg-rose-500 w-0"
                                                                        : product.available_stock <= 5
                                                                            ? "bg-amber-500"
                                                                            : "bg-[#4E6047]",
                                                                ].join(" ")}
                                                                style={{
                                                                    width: `${Math.min(100, Math.max(8, product.available_stock * 5))}%`,
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Status Badges */}
                                                <td className="px-5 py-4">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span
                                                            className={[
                                                                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border",
                                                                product.is_active
                                                                    ? "bg-[#EDF6EE] text-[#4E6047] border-[#CFDFCF]"
                                                                    : "bg-[#F5F2EB] text-[#78716C] border-[#E8E3DB]",
                                                            ].join(" ")}
                                                        >
                                                            <span
                                                                className={[
                                                                    "size-1.5 rounded-full",
                                                                    product.is_active ? "bg-[#4E6047]" : "bg-[#A8A29E]",
                                                                ].join(" ")}
                                                            />
                                                            {product.is_active ? "Active" : "Archived"}
                                                        </span>

                                                        {product.is_active && (
                                                            <span
                                                                className={[
                                                                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border",
                                                                    stockClasses,
                                                                ].join(" ")}
                                                            >
                                                                {stockLabel}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Actions */}
                                                <td className="px-5 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {/* Edit button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditForm(product)}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E3DB] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] shadow-2xs hover:bg-[#FAF8F5] hover:border-[#D6CEC4] transition cursor-pointer"
                                                        >
                                                            <Edit3 className="size-3.5 text-[#78716C]" />
                                                            Edit
                                                        </button>

                                                        {/* Archive / Restore button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleArchiveToggle(product)}
                                                            disabled={
                                                                archivingId === product.id ||
                                                                deletingId === product.id
                                                            }
                                                            className={[
                                                                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer disabled:opacity-50",
                                                                product.is_active
                                                                    ? "border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-100/60"
                                                                    : "border-[#CFDFCF] bg-[#EDF6EE]/50 text-[#4E6047] hover:bg-[#EDF6EE]",
                                                            ].join(" ")}
                                                        >
                                                            {archivingId === product.id ? (
                                                                <RefreshCw className="size-3.5 animate-spin" />
                                                            ) : product.is_active ? (
                                                                <Archive className="size-3.5" />
                                                            ) : (
                                                                <RefreshCw className="size-3.5" />
                                                            )}

                                                            {archivingId === product.id
                                                                ? product.is_active
                                                                    ? "Archiving..."
                                                                    : "Restoring..."
                                                                : product.is_active
                                                                    ? "Archive"
                                                                    : "Restore"}
                                                        </button>

                                                        {/* Delete button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleDelete(product)}
                                                            disabled={deletingId === product.id}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50/50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer disabled:opacity-50"
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                            {deletingId === product.id ? "Deleting..." : "Delete"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal / Dialog for Create or Edit Product */}
            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-lg rounded-3xl border border-[#E8E3DB] bg-white shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-[#E8E3DB] bg-[#FAF8F5] px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="flex size-9 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                    {editingProduct ? (
                                        <Edit3 className="size-4" />
                                    ) : (
                                        <Sparkles className="size-4 text-[#78350F]" />
                                    )}
                                </div>
                                <div>
                                    <h2 className="font-serif-brand text-base font-bold text-[#1C1917]">
                                        {editingProduct
                                            ? `Edit "${editingProduct.name}"`
                                            : "Add Product"}
                                    </h2>
                                    <p className="text-xs text-[#78716C]">
                                        {editingProduct
                                            ? "Update product details, price, and stock."
                                            : "Add an item to the menu."}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeForm}
                                disabled={saving}
                                className="rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F2EB] hover:text-[#1C1917] transition disabled:opacity-50 cursor-pointer"
                                aria-label="Close"
                            >
                                <X className="size-5" />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form
                            onSubmit={handleSubmit}
                            className="space-y-5 p-6"
                        >
                            {formError && (
                                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">
                                    <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                                    <span>{formError}</span>
                                </div>
                            )}

                            {!editingProduct && form.barcode && (
                                <div className="flex items-center gap-2.5 rounded-xl border border-[#C8E3CE] bg-[#EDF6EE] px-4 py-3 text-xs text-[#215A36]">
                                    <Barcode className="size-4.5 shrink-0 text-[#215A36]" />
                                    <span>
                                        Scanned Barcode: <strong className="font-mono font-bold text-[#1C1917] bg-white/70 px-1.5 py-0.5 rounded border border-[#C8E3CE]">{form.barcode}</strong>. Complete the name, price, and initial stock to register this item in inventory.
                                    </span>
                                </div>
                            )}

                            <div>
                                <label
                                    htmlFor="product-name"
                                    className="mb-1.5 block text-xs font-bold text-[#1C1917] uppercase tracking-wider"
                                >
                                    Product Name
                                </label>
                                <input
                                    id="product-name"
                                    type="text"
                                    value={form.name}
                                    onChange={(event) =>
                                        updateForm(
                                            "name",
                                            event.target.value,
                                        )
                                    }
                                    placeholder="e.g. Vanilla Bean Latte"
                                    disabled={saving}
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 px-3.5 py-2.5 text-sm text-[#1C1917] outline-none transition placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/20 disabled:bg-[#F5F2EB]"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label
                                        htmlFor="product-price"
                                        className="mb-1.5 block text-xs font-bold text-[#1C1917] uppercase tracking-wider"
                                    >
                                        Price (USD)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#A8A29E]">
                                            $
                                        </span>
                                        <input
                                            id="product-price"
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            value={form.price}
                                            onChange={(event) =>
                                                updateForm(
                                                    "price",
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="4.50"
                                            disabled={saving}
                                            className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 py-2.5 pl-8 pr-3.5 text-sm font-semibold text-[#1C1917] outline-none transition placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/20 disabled:bg-[#F5F2EB] tnum"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label
                                        htmlFor="product-stock"
                                        className="mb-1.5 block text-xs font-bold text-[#1C1917] uppercase tracking-wider"
                                    >
                                        Available Quantity
                                    </label>
                                    <input
                                        id="product-stock"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={form.available_stock}
                                        onChange={(event) =>
                                            updateForm(
                                                "available_stock",
                                                event.target.value,
                                            )
                                        }
                                        placeholder="25"
                                        disabled={saving}
                                        className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 px-3.5 py-2.5 text-sm font-semibold text-[#1C1917] outline-none transition placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/20 disabled:bg-[#F5F2EB] tnum"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label
                                        htmlFor="product-category"
                                        className="mb-1.5 block text-xs font-bold text-[#1C1917] uppercase tracking-wider"
                                    >
                                        Category
                                    </label>
                                    <select
                                        id="product-category"
                                        value={form.category}
                                        onChange={(event) =>
                                            updateForm("category", event.target.value)
                                        }
                                        disabled={saving}
                                        className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 px-3.5 py-2.5 text-sm font-semibold text-[#1C1917] outline-none transition focus:bg-white focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/20 disabled:bg-[#F5F2EB]"
                                    >
                                        <option value="Coffee">Coffee</option>
                                        <option value="Cold Drinks">Cold Drinks</option>
                                        <option value="Tea">Tea</option>
                                        <option value="Bakery">Bakery</option>
                                        <option value="Retail">Retail</option>
                                    </select>
                                </div>

                                {editingProduct && (
                                    <div>
                                        <label
                                            htmlFor="product-reason"
                                            className="mb-1.5 block text-xs font-bold text-[#1C1917] uppercase tracking-wider"
                                        >
                                            Stock Adjustment Reason
                                        </label>
                                        <select
                                            id="product-reason"
                                            value={form.adjustment_reason}
                                            onChange={(event) =>
                                                updateForm("adjustment_reason", event.target.value)
                                            }
                                            disabled={saving}
                                            className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 px-3.5 py-2.5 text-sm font-semibold text-[#1C1917] outline-none transition focus:bg-white focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/20 disabled:bg-[#F5F2EB]"
                                        >
                                            <option value="Inventory Recount">Inventory Recount / Audit</option>
                                            <option value="Supplier Delivery">Supplier Delivery / Restock</option>
                                            <option value="Spillage / Spoiled">Spillage / Spoiled Goods</option>
                                            <option value="Damaged Goods Write-off">Damaged Goods Write-off</option>
                                            <option value="Manual Correction">Manual Correction</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            {/* Barcode / SKU Input */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label
                                        htmlFor="product-barcode"
                                        className="block text-xs font-bold text-[#1C1917] uppercase tracking-wider"
                                    >
                                        Barcode / SKU
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsCameraScanningForm(true)}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#78350F] hover:underline cursor-pointer"
                                    >
                                        <Camera className="size-3 text-[#78350F]" />
                                        Scan with Camera
                                    </button>
                                </div>
                                <div className="relative">
                                    <Barcode className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#A8A29E]" />
                                    <input
                                        id="product-barcode"
                                        type="text"
                                        value={form.barcode}
                                        onChange={(event) =>
                                            updateForm(
                                                "barcode",
                                                event.target.value,
                                            )
                                        }
                                        placeholder="e.g. 012345678905, CAFE-001..."
                                        disabled={saving}
                                        className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 py-2.5 pl-10 pr-3.5 text-sm font-mono text-[#1C1917] outline-none transition placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/20 disabled:bg-[#F5F2EB]"
                                    />
                                </div>
                                <p className="mt-1 text-[11px] text-[#78716C]">
                                    Supports physical USB/Bluetooth scanners, EAN-13, UPC-A, Code 128. Leading zeros are preserved.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2.5 border-t border-[#E8E3DB] pt-5">
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    disabled={saving}
                                    className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2.5 text-xs font-semibold text-[#1C1917] shadow-2xs hover:bg-[#FAF8F5] transition disabled:opacity-50 cursor-pointer"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#78350F] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#5C2B09] transition disabled:opacity-50 cursor-pointer active:scale-98"
                                >
                                    {saving && (
                                        <RefreshCw className="size-3.5 animate-spin text-[#FDE68A]" />
                                    )}

                                    {editingProduct
                                        ? "Save Changes"
                                        : "Add Product"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Audit Log Modal */}
            {isLogsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-4xl max-h-[85vh] rounded-3xl border border-[#E8E3DB] bg-white shadow-2xl flex flex-col overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-[#E8E3DB] bg-[#FAF8F5] px-6 py-4 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="flex size-9 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                    <History className="size-4" />
                                </div>
                                <div>
                                    <h2 className="font-serif-brand text-base font-bold text-[#1C1917]">
                                        Inventory Audit Log
                                    </h2>
                                    <p className="text-xs text-[#78716C]">
                                        Detailed ledger of all stock adjustments, recounts, and write-offs.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsLogsModalOpen(false)}
                                className="rounded-lg p-1.5 text-[#78716C] hover:bg-[#F5F2EB] hover:text-[#1C1917] transition cursor-pointer"
                                aria-label="Close"
                            >
                                <X className="size-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {logsLoading ? (
                                <div className="flex items-center justify-center py-12 gap-2 text-sm text-[#78716C]">
                                    <RefreshCw className="size-4 animate-spin text-[#78350F]" />
                                    Loading stock adjustment history...
                                </div>
                            ) : inventoryLogs.length === 0 ? (
                                <div className="py-12 text-center text-sm text-[#78716C]">
                                    No stock adjustment logs recorded yet.
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="border-b border-[#E8E3DB] text-[#78716C] uppercase font-bold tracking-wider">
                                            <th className="pb-3 px-3">Date & Time</th>
                                            <th className="pb-3 px-3">Product ID</th>
                                            <th className="pb-3 px-3">Stock Change</th>
                                            <th className="pb-3 px-3">New Level</th>
                                            <th className="pb-3 px-3">Reason</th>
                                            <th className="pb-3 px-3">User ID</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E8E3DB]/60">
                                        {inventoryLogs.map((log) => {
                                            const isIncrease = log.change_amount > 0
                                            return (
                                                <tr key={log.id} className="hover:bg-[#FAF8F5]/80">
                                                    <td className="py-3 px-3 text-[#1C1917] font-medium whitespace-nowrap">
                                                        {new Date(log.created_at).toLocaleString([], {
                                                            month: "short",
                                                            day: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </td>
                                                    <td className="py-3 px-3 text-[#78716C] font-mono">
                                                        #{log.product_id}
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <span
                                                            className={[
                                                                "inline-flex items-center px-2 py-0.5 rounded font-bold tnum",
                                                                isIncrease
                                                                    ? "bg-emerald-50 text-emerald-800"
                                                                    : "bg-rose-50 text-rose-800",
                                                            ].join(" ")}
                                                        >
                                                            {isIncrease ? `+${log.change_amount}` : log.change_amount}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 font-semibold text-[#1C1917] tnum">
                                                        {log.new_stock}
                                                    </td>
                                                    <td className="py-3 px-3 text-[#44403C]">
                                                        {log.reason || "Manual update"}
                                                    </td>
                                                    <td className="py-3 px-3 text-[#78716C] font-mono">
                                                        {log.user_id ? `User #${log.user_id}` : "System"}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="border-t border-[#E8E3DB] bg-[#FAF8F5] px-6 py-3 flex justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsLogsModalOpen(false)}
                                className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 text-xs font-semibold text-[#1C1917] shadow-2xs hover:bg-[#F5F2EB] transition cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Ingredients & BOM Modal */}
            <IngredientsModal
                isOpen={isIngredientsModalOpen}
                onClose={() => setIsIngredientsModalOpen(false)}
            />

            {/* Quick Barcode Scanner Modal for Inventory */}
            <BarcodeScannerModal
                isOpen={isInventoryScannerOpen}
                onClose={() => setIsInventoryScannerOpen(false)}
                onScan={(code) => void handleBarcodeLookup(code)}
                title="Scan Barcode to Restock or Add"
                subtitle="Position any barcode in front of the camera or use a USB scanner. Existing items open for restocking; new barcodes open to add to inventory."
            />

            {/* Camera Scanner for Product Add/Edit Form */}
            <BarcodeScannerModal
                isOpen={isCameraScanningForm}
                onClose={() => setIsCameraScanningForm(false)}
                onScan={(code) => {
                    updateForm("barcode", code)
                    setIsCameraScanningForm(false)
                }}
                title="Scan Barcode for Product"
                subtitle="Position barcode to automatically fill the field."
            />

            {/* Error & Success Toasts */}
            <Toast
                message={error || null}
                variant="error"
                duration={3000}
                onClose={() => setError("")}
            />

            <Toast
                message={successMessage || null}
                variant="success"
                duration={3000}
                onClose={() => setSuccessMessage("")}
            />
        </div>
    )
}