import { SearchX } from "lucide-react"
import { ProductCard } from "./ProductCard"
import { resolveProductImage } from "../../lib/productImages"

export type Product = {
    id: number
    name: string
    price: number
    stock: number
    category?: string
    barcode?: string | null
}

type ProductGridProps = {
    products: Product[]
    onAddToCart?: (productId: number) => void
}

export function ProductGrid({
    products,
    onAddToCart,
}: ProductGridProps) {
    if (products.length === 0) {
        return (
            <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-[#D8D1C5] bg-white/70 p-8 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-[#FAF8F5] text-[#78350F] border border-[#E8E3DB] shadow-xs">
                    <SearchX className="size-6 text-[#78350F]" />
                </div>

                <h3 className="mt-4 font-serif-brand text-base font-bold text-[#1C1917]">
                    No Products Found
                </h3>

                <p className="mt-1 max-w-sm text-xs leading-relaxed text-[#78716C]">
                    No products match your search or filter. Try a different term or clear the filter.
                </p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
            {products.map((product) => (
                <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    price={product.price}
                    stock={product.stock}
                    image={resolveProductImage(product.id, product.name)}
                    onAddToCart={onAddToCart}
                />
            ))}
        </div>
    )
}
