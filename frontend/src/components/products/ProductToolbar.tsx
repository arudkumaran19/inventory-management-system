import { Barcode, Camera, Search, X } from "lucide-react"

export type StockFilter = "all" | "in-stock" | "low-stock" | "out-of-stock"
export type CategoryFilter =
    | "all"
    | "coffee"
    | "cold"
    | "tea"
    | "bakery"
    | "retail"

type ProductToolbarProps = {
    search: string
    onSearchChange: (value: string) => void
    stockFilter: StockFilter
    onStockFilterChange: (value: StockFilter) => void
    categoryFilter?: CategoryFilter
    onCategoryFilterChange?: (category: CategoryFilter) => void
    onScanBarcodeClick?: () => void
}

const stockOptions: { id: StockFilter; label: string; dot?: string }[] = [
    { id: "all", label: "All" },
    { id: "in-stock", label: "In Stock", dot: "bg-[#4E6047]" },
    { id: "low-stock", label: "Running Low", dot: "bg-[#B45309]" },
    { id: "out-of-stock", label: "Out of Stock", dot: "bg-[#9B2C2C]" },
]

const categoryOptions: { id: CategoryFilter; label: string }[] = [
    { id: "all", label: "All Categories" },
    { id: "coffee", label: "Coffee" },
    { id: "cold", label: "Cold Drinks" },
    { id: "tea", label: "Tea" },
    { id: "bakery", label: "Bakery" },
    { id: "retail", label: "Beans & Retail" },
]

export function ProductToolbar({
    search,
    onSearchChange,
    stockFilter,
    onStockFilterChange,
    categoryFilter = "all",
    onCategoryFilterChange,
    onScanBarcodeClick,
}: ProductToolbarProps) {
    return (
        <div className="space-y-3">
            {/* Search, Barcode Scanner, and Stock Level Filter Row */}
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* Search Input with Clear Button */}
                    <div className="relative min-w-0 flex-1 sm:max-w-md">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#A8A29E]" />

                        <input
                            type="text"
                            value={search}
                            onChange={(event) => onSearchChange(event.target.value)}
                            placeholder="Search name or scan barcode..."
                            aria-label="Search products or scan barcode"
                            className="h-10 w-full rounded-xl border border-[#E8E3DB] bg-white pl-10 pr-9 text-sm text-[#1C1917] outline-none transition-all placeholder:text-[#A8A29E] focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/15 shadow-2xs"
                        />

                        {search && (
                            <button
                                type="button"
                                aria-label="Clear search"
                                onClick={() => onSearchChange("")}
                                className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-lg text-[#A8A29E] transition-colors hover:bg-[#F5F1EA] hover:text-[#1C1917]"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Camera Barcode Scanner Button */}
                    {onScanBarcodeClick && (
                        <button
                            type="button"
                            onClick={onScanBarcodeClick}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3 text-xs font-bold text-[#78350F] shadow-2xs hover:bg-[#FEF8EC] hover:border-[#F2DEBA] active:scale-95 transition-all shrink-0 cursor-pointer"
                            title="Open Camera Barcode Scanner"
                        >
                            <Camera className="size-3.5 text-[#78350F]" />
                            <span className="hidden sm:inline">Camera Scan</span>
                        </button>
                    )}

                    {/* Hardware USB/Bluetooth Scanner Status Pill */}
                    <div
                        className="hidden xl:inline-flex items-center gap-1.5 rounded-xl border border-[#C8E3CE] bg-[#EDF6EE]/70 px-2.5 py-2 text-[11px] font-semibold text-[#215A36] shrink-0"
                        title="Physical USB and Bluetooth barcode scanners are active and ready"
                    >
                        <span className="size-1.5 rounded-full bg-[#215A36] animate-pulse" />
                        <Barcode className="size-3" />
                        <span>Scanner Ready</span>
                    </div>
                </div>

                {/* Stock status filter pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {stockOptions.map((opt) => {
                        const active = stockFilter === opt.id

                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => onStockFilterChange(opt.id)}
                                className={[
                                    "inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-all duration-150 active:scale-95",
                                    active
                                        ? "bg-[#1C1917] text-white shadow-xs"
                                        : "border border-[#E8E3DB] bg-white text-[#57534E] hover:border-[#D8D1C5] hover:bg-[#FAF8F5] hover:text-[#1C1917]",
                                ].join(" ")}
                            >
                                {opt.dot && (
                                    <span
                                        className={[
                                            "size-1.5 rounded-full shrink-0",
                                            opt.dot,
                                        ].join(" ")}
                                    />
                                )}
                                {opt.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Category Navigation Tabs */}
            {onCategoryFilterChange && (
                <div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#E8E3DB] pb-2">
                    {categoryOptions.map((cat) => {
                        const active = categoryFilter === cat.id

                        return (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => onCategoryFilterChange(cat.id)}
                                className={[
                                    "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-semibold transition-all duration-150 active:scale-95",
                                    active
                                        ? "bg-[#78350F] text-white shadow-xs"
                                        : "bg-[#F5F1EA] text-[#57534E] hover:bg-[#E8E3DB] hover:text-[#1C1917]",
                                ].join(" ")}
                            >
                                {cat.label}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
