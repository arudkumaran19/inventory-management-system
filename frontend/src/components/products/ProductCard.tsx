import { Coffee, Plus } from "lucide-react"

type ProductCardProps = {
    id: number
    name: string
    price: number
    stock: number
    image?: string
    onAddToCart?: (productId: number) => void
}

export function ProductCard({
    id,
    name,
    price,
    stock,
    image,
    onAddToCart,
}: ProductCardProps) {
    const isOutOfStock = stock <= 0
    const isLowStock = stock > 0 && stock <= 5

    return (
        <article
            onClick={() => {
                if (!isOutOfStock) {
                    onAddToCart?.(id)
                }
            }}
            className={[
                "group relative flex flex-col rounded-2xl border bg-white p-3 shadow-2xs transition-all duration-150 select-none",
                isOutOfStock
                    ? "border-[#E8E3DB] opacity-65 cursor-not-allowed"
                    : "cursor-pointer border-[#E8E3DB] hover:-translate-y-0.5 hover:border-[#78350F]/40 hover:shadow-md hover:shadow-[#78350F]/5 active:scale-[0.98]",
            ].join(" ")}
        >
            {/* Image Showcase Container */}
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F5F1EA]">
                {image ? (
                    <img
                        src={image}
                        alt={name}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                    />
                ) : (
                    <div className="flex size-full items-center justify-center text-[#A8A29E]">
                        <Coffee className="size-8 transition-transform duration-200 group-hover:scale-110 group-hover:text-[#78350F]" />
                    </div>
                )}

                {/* Floating Stock Status Badge */}
                <div className="absolute right-2 top-2 z-10">
                    <span
                        className={[
                            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-xs backdrop-blur-md transition-all",
                            isOutOfStock
                                ? "bg-white/95 text-[#78716C] border border-[#E8E3DB]"
                                : isLowStock
                                    ? "bg-[#FEF8EC]/95 text-[#8C4E08] border border-[#F7E0B5]"
                                    : "bg-[#EDF6EE]/95 text-[#215A36] border border-[#C8E3CE]",
                        ].join(" ")}
                    >
                        <span
                            className={[
                                "size-1.5 rounded-full shrink-0",
                                isOutOfStock
                                    ? "bg-[#78716C]"
                                    : isLowStock
                                        ? "bg-[#B45309] animate-pulse"
                                        : "bg-[#4E6047]",
                            ].join(" ")}
                        />
                        {isOutOfStock
                            ? "Sold out"
                            : isLowStock
                                ? `${stock} left`
                                : `${stock} in stock`}
                    </span>
                </div>
            </div>

            {/* Product Meta & Price */}
            <div className="mt-3 flex flex-1 flex-col justify-between">
                <div>
                    <h3 className="line-clamp-1 text-sm font-bold tracking-tight text-[#1C1917] transition-colors group-hover:text-[#78350F]">
                        {name}
                    </h3>
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-[#E8E3DB]/70 pt-2">
                    <p className="tnum text-base font-extrabold tracking-tight text-[#1C1917]">
                        ${price.toFixed(2)}
                    </p>

                    <button
                        type="button"
                        disabled={isOutOfStock}
                        aria-label={`Add ${name} to register ticket`}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (!isOutOfStock) {
                                onAddToCart?.(id)
                            }
                        }}
                        className={[
                            "flex size-7.5 items-center justify-center rounded-lg font-bold transition-all active:scale-90",
                            isOutOfStock
                                ? "bg-[#F5F1EA] text-[#A8A29E] cursor-not-allowed"
                                : "bg-[#FAF8F5] text-[#78350F] border border-[#E8E3DB] hover:bg-[#78350F] hover:text-white hover:border-[#78350F]",
                        ].join(" ")}
                    >
                        <Plus className="size-4 stroke-[2.5]" />
                    </button>
                </div>
            </div>
        </article>
    )
}
