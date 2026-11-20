import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    ArrowRight,
    CheckCircle2,
    Clock,
    CreditCard,
    Loader2,
    PackageSearch,
    ShieldCheck,
    ShoppingCart,
    Undo2,
    XCircle,
} from "lucide-react"
import { ToastStack, type ToastItemData, type ToastVariant } from "../ui/Toast"

import {
    addCartItem,
    cancelOrder,
    checkoutCart,
    createCart,
    getCart,
    getOrder,
    getProducts,
    processPayment,
    removeCartItem,
    updateCartItemQuantity,
    type CheckoutResponse,
    type Product as ApiProduct,
} from "../../lib/api"

import { ProductGrid, type Product } from "./ProductGrid"
import {
    ProductToolbar,
    type CategoryFilter,
    type StockFilter,
} from "./ProductToolbar"
import {
    CartPanel,
    type CartItem,
} from "../cart/CartPanel"

const CART_ID_KEY = "pos_cart_id"
const CART_ITEMS_KEY = "pos_cart_items"
const CHECKOUT_RESPONSE_KEY = "pos_checkout_response"
const IDEMPOTENCY_KEY = "pos_idempotency_key"

function mapProduct(product: ApiProduct): Product {
    return {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        stock: product.available_stock,
    }
}

type PersistedPOSState = {
    cartId: number | null
    cartItems: CartItem[]
    checkoutResponse: CheckoutResponse | null
    idempotencyKey: string | null
}

function loadPersistedPOSState(): PersistedPOSState {
    try {
        const storedId = sessionStorage.getItem(CART_ID_KEY)
        const storedItems = sessionStorage.getItem(CART_ITEMS_KEY)
        const storedCheckout = sessionStorage.getItem(CHECKOUT_RESPONSE_KEY)
        const storedKey = sessionStorage.getItem(IDEMPOTENCY_KEY)

        return {
            cartId: storedId ? Number(storedId) : null,
            cartItems: storedItems ? (JSON.parse(storedItems) as CartItem[]) : [],
            checkoutResponse: storedCheckout
                ? (JSON.parse(storedCheckout) as CheckoutResponse)
                : null,
            idempotencyKey: storedKey ?? null,
        }
    } catch {
        return {
            cartId: null,
            cartItems: [],
            checkoutResponse: null,
            idempotencyKey: null,
        }
    }
}

function persistPOSState(
    cartId: number | null,
    cartItems: CartItem[],
    checkoutResponse: CheckoutResponse | null,
    idempotencyKey: string | null,
) {
    try {
        if (cartId !== null) {
            sessionStorage.setItem(CART_ID_KEY, String(cartId))
        } else {
            sessionStorage.removeItem(CART_ID_KEY)
        }

        sessionStorage.setItem(CART_ITEMS_KEY, JSON.stringify(cartItems))

        if (checkoutResponse !== null) {
            sessionStorage.setItem(
                CHECKOUT_RESPONSE_KEY,
                JSON.stringify(checkoutResponse),
            )
        } else {
            sessionStorage.removeItem(CHECKOUT_RESPONSE_KEY)
        }

        if (idempotencyKey !== null) {
            sessionStorage.setItem(IDEMPOTENCY_KEY, idempotencyKey)
        } else {
            sessionStorage.removeItem(IDEMPOTENCY_KEY)
        }
    } catch {
        // sessionStorage not available (e.g. private browsing — silently ignore)
    }
}

export function POSPage() {
    const [search, setSearch] = useState("")
    const [stockFilter, setStockFilter] = useState<StockFilter>("all")
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all")
    const [products, setProducts] = useState<Product[]>([])

    // Restore cart and checkout/payment state from sessionStorage
    const persisted = useMemo(() => loadPersistedPOSState(), [])
    const [cartItems, setCartItems] = useState<CartItem[]>(persisted.cartItems)
    const [cartId, setCartId] = useState<number | null>(persisted.cartId)

    const [mobileCartOpen, setMobileCartOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [isCheckingOut, setIsCheckingOut] = useState(false)

    const [checkoutResponse, setCheckoutResponse] =
        useState<CheckoutResponse | null>(persisted.checkoutResponse)

    const [paymentLoading, setPaymentLoading] = useState(false)

    // Stacked, non-overlapping toast notification system
    const [toasts, setToasts] = useState<ToastItemData[]>([])

    // Countdown remaining seconds for 5-minute reservation
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)

    const addToast = useCallback(
        (message: string, variant: ToastVariant = "success", duration = 5000) => {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
            setToasts((prev) => [...prev, { id, message, variant, duration }])
        },
        [],
    )

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
    }, [])

    // Stable idempotency key — preserved across navigations and retries.
    const idempotencyKeyRef = useRef<string | null>(persisted.idempotencyKey)

    // Live countdown timer for active reservation
    useEffect(() => {
        if (!checkoutResponse || checkoutResponse.order.status !== "Reserved" || !checkoutResponse.reservation_expires_at) {
            return
        }

        const updateCountdown = () => {
            const expiryMs = new Date(checkoutResponse.reservation_expires_at).getTime()
            const diff = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000))
            setRemainingSeconds(diff)
        }

        updateCountdown()
        const timerId = setInterval(updateCountdown, 1000)

        return () => {
            clearInterval(timerId)
            setRemainingSeconds(null)
        }
    }, [checkoutResponse])

    // Persist full POS state to sessionStorage whenever it changes.
    useEffect(() => {
        persistPOSState(
            cartId,
            cartItems,
            checkoutResponse,
            idempotencyKeyRef.current,
        )
    }, [cartId, cartItems, checkoutResponse])

    useEffect(() => {
        let cancelled = false

        async function loadProducts(isInitial = false) {
            try {
                if (isInitial) {
                    setLoading(true)
                    setError(null)
                }

                const response = await getProducts()

                if (!cancelled) {
                    setProducts(
                        response
                            .filter((product) => product.is_active)
                            .map(mapProduct),
                    )
                }
            } catch (requestError) {
                if (!cancelled && isInitial) {
                    setError(
                        requestError instanceof Error
                            ? requestError.message
                            : "Unable to load products.",
                    )
                }
            } finally {
                if (!cancelled && isInitial) {
                    setLoading(false)
                }
            }
        }

        void loadProducts(true)

        // Silent auto-refresh products every 4 seconds and on focus so stock counts update live
        const intervalId = setInterval(() => {
            void loadProducts(false)
        }, 4000)
        const onFocus = () => void loadProducts(false)
        window.addEventListener("focus", onFocus)

        return () => {
            cancelled = true
            clearInterval(intervalId)
            window.removeEventListener("focus", onFocus)
        }
    }, [])

    // If an active checkoutResponse exists, sync live status and poll while Reserved
    useEffect(() => {
        if (!checkoutResponse || checkoutResponse.order.status !== "Reserved") {
            return
        }

        let cancelled = false

        // Check immediately
        getOrder(checkoutResponse.order.id)
            .then(async (freshOrder) => {
                if (cancelled) return
                if (freshOrder.status !== checkoutResponse.order.status) {
                    setCheckoutResponse((current) =>
                        current ? { ...current, order: freshOrder } : null,
                    )
                    const refreshed = await getProducts()
                    if (!cancelled) {
                        setProducts(
                            refreshed
                                .filter((p) => p.is_active)
                                .map(mapProduct),
                        )
                    }
                }
            })
            .catch(() => {})

        // Poll every 5 seconds to catch 5-minute automatic expiration or external cancellation
        const intervalId = setInterval(async () => {
            try {
                const freshOrder = await getOrder(checkoutResponse.order.id)
                if (cancelled) return

                if (freshOrder.status !== checkoutResponse.order.status) {
                    setCheckoutResponse((current) =>
                        current ? { ...current, order: freshOrder } : null,
                    )

                    // If status changed to Expired/Cancelled/Paid, refresh products to reflect restock
                    const refreshed = await getProducts()
                    if (!cancelled) {
                        setProducts(
                            refreshed
                                .filter((p) => p.is_active)
                                .map(mapProduct),
                        )
                    }
                }
            } catch {
                // Ignore transient network errors
            }
        }, 5000)

        return () => {
            cancelled = true
            clearInterval(intervalId)
        }
    }, [checkoutResponse])

    // Validate current cart or initialize a fresh one
    useEffect(() => {
        let cancelled = false

        async function initializeCart() {
            // If an order is currently reserved and awaiting payment, do not touch the cart
            if (
                checkoutResponse &&
                checkoutResponse.order.status === "Reserved"
            ) {
                return
            }

            // If we have a cartId, verify it is still Active on the server
            if (cartId !== null) {
                try {
                    const serverCart = await getCart(cartId)
                    if (serverCart.status === "Active") {
                        return
                    }
                } catch {
                    // Cart does not exist on server — fall through to createCart
                }
            }

            // Create a fresh active cart so checkout and item operations work
            try {
                const freshCart = await createCart()
                if (!cancelled) {
                    setCartId(freshCart.id)
                    if (!checkoutResponse || checkoutResponse.order.status !== "Reserved") {
                        setCartItems([])
                    }
                }
            } catch (requestError) {
                if (!cancelled) {
                    setError(
                        requestError instanceof Error
                            ? requestError.message
                            : "Unable to initialize cart.",
                    )
                }
            }
        }

        void initializeCart()

        return () => {
            cancelled = true
        }
    }, [cartId, checkoutResponse])

    const filteredProducts = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase()

        return products.filter((product) => {
            const matchesSearch =
                !normalizedSearch ||
                product.name.toLowerCase().includes(normalizedSearch)

            const matchesStock =
                stockFilter === "all"
                    ? true
                    : stockFilter === "in-stock"
                        ? product.stock > 0
                        : stockFilter === "low-stock"
                            ? product.stock > 0 && product.stock <= 5
                            : product.stock === 0

            let matchesCategory = true
            if (categoryFilter !== "all") {
                const name = product.name.toLowerCase()
                if (categoryFilter === "coffee") {
                    matchesCategory =
                        (name.includes("espresso") ||
                            name.includes("cappuccino") ||
                            name.includes("latte") ||
                            name.includes("coffee") ||
                            name.includes("americano")) &&
                        !name.includes("iced") &&
                        !name.includes("cold") &&
                        !name.includes("beans")
                } else if (categoryFilter === "cold") {
                    matchesCategory = name.includes("cold") || name.includes("iced")
                } else if (categoryFilter === "tea") {
                    matchesCategory = name.includes("matcha") || name.includes("tea") || name.includes("chai")
                } else if (categoryFilter === "bakery") {
                    matchesCategory =
                        name.includes("croissant") ||
                        name.includes("muffin") ||
                        name.includes("cookie") ||
                        name.includes("pastry") ||
                        name.includes("cake") ||
                        name.includes("bread")
                } else if (categoryFilter === "retail") {
                    matchesCategory = name.includes("beans") || name.includes("bottle") || name.includes("bag")
                }
            }

            return matchesSearch && matchesStock && matchesCategory
        })
    }, [products, search, stockFilter, categoryFilter])

    const addToCart = async (productId: number) => {
        const product = products.find((item) => item.id === productId)

        if (!product || product.stock <= 0) {
            return
        }

        if (
            checkoutResponse &&
            checkoutResponse.order.status === "Reserved"
        ) {
            addToast(
                `Order #${checkoutResponse.order.id} is awaiting payment. Settle or cancel it before starting a new ticket.`,
                "info",
                5000,
            )
            return
        }

        if (cartId === null) {
            return
        }

        try {
            await addCartItem(cartId, productId, 1)
        } catch (requestError) {
            const message =
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to add item to cart."

            if (message.includes("Cart is not active")) {
                try {
                    const freshCart = await createCart()
                    setCartId(freshCart.id)
                    setCartItems([])
                    setCheckoutResponse(null)
                    await addCartItem(freshCart.id, productId, 1)
                } catch {
                    addToast("Unable to add item to cart.", "error", 5000)
                    return
                }
            } else {
                addToast(message, "error", 5000)
                return
            }
        }

        setCartItems((currentItems) => {
            const existingItem = currentItems.find(
                (item) => item.id === productId,
            )

            if (existingItem) {
                return currentItems.map((item) =>
                    item.id === productId
                        ? { ...item, quantity: item.quantity + 1 }
                        : item,
                )
            }

            return [
                ...currentItems,
                {
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    quantity: 1,
                },
            ]
        })

        if (window.matchMedia("(max-width: 1279px)").matches) {
            setMobileCartOpen(true)
        }
    }

    const increaseQuantity = async (productId: number) => {
        const item = cartItems.find(
            (cartItem) => cartItem.id === productId,
        )

        if (!item || cartId === null) {
            return
        }

        try {
            const updatedCart = await updateCartItemQuantity(
                cartId,
                productId,
                item.quantity + 1,
            )

            setCartItems((currentItems) =>
                currentItems.map((currentItem) => {
                    const backendItem = updatedCart.items.find(
                        (cartItem) => cartItem.product_id === currentItem.id,
                    )

                    return backendItem
                        ? {
                            ...currentItem,
                            quantity: backendItem.quantity,
                        }
                        : currentItem
                }),
            )
        } catch (requestError) {
            setError(
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to update quantity.",
            )
        }
    }

    const decreaseQuantity = async (productId: number) => {
        const item = cartItems.find(
            (cartItem) => cartItem.id === productId,
        )

        if (!item || cartId === null) {
            return
        }

        try {
            if (item.quantity === 1) {
                await removeCartItem(cartId, productId)

                setCartItems((currentItems) =>
                    currentItems.filter(
                        (currentItem) => currentItem.id !== productId,
                    ),
                )

                return
            }

            const updatedCart = await updateCartItemQuantity(
                cartId,
                productId,
                item.quantity - 1,
            )

            setCartItems((currentItems) =>
                currentItems.map((currentItem) => {
                    const backendItem = updatedCart.items.find(
                        (cartItem) => cartItem.product_id === currentItem.id,
                    )

                    return backendItem
                        ? {
                            ...currentItem,
                            quantity: backendItem.quantity,
                        }
                        : currentItem
                }),
            )
        } catch (requestError) {
            addToast(
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to update quantity.",
                "error",
                5000,
            )
        }
    }

    const removeFromCart = async (productId: number) => {
        if (cartId === null) {
            return
        }

        try {
            await removeCartItem(cartId, productId)

            setCartItems((currentItems) =>
                currentItems.filter((item) => item.id !== productId),
            )
        } catch (requestError) {
            addToast(
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to remove item.",
                "error",
                5000,
            )
        }
    }

    const handleCheckout = async () => {
        if (cartId === null || cartItems.length === 0 || isCheckingOut) {
            return
        }

        if (
            checkoutResponse &&
            checkoutResponse.order.status === "Reserved"
        ) {
            return
        }

        try {
            setIsCheckingOut(true)
            idempotencyKeyRef.current = null

            const response = await checkoutCart(cartId)
            setCheckoutResponse(response)

            // Generate stable idempotency key tied to order
            const newKey = `pos-${response.order.id}-payment`
            idempotencyKeyRef.current = newKey

            const expiryTime = new Date(response.reservation_expires_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            })
            addToast(
                `Order #${response.order.id} reserved. Stock held until ${expiryTime}.`,
                "success",
                5000,
            )

            // Refresh products so available stock visibly decreases on product cards
            const refreshedProducts = await getProducts()
            setProducts(
                refreshedProducts
                    .filter((product) => product.is_active)
                    .map(mapProduct),
            )

        } catch (requestError) {
            const message =
                requestError instanceof Error
                    ? requestError.message
                    : "Checkout failed."

            if (message.includes("Cart is not active")) {
                try {
                    const freshCart = await createCart()
                    setCartId(freshCart.id)
                    setCartItems([])
                    setCheckoutResponse(null)
                    addToast(
                        "The previous ticket was finalized. A new register ticket has been opened.",
                        "error",
                        6000,
                    )
                    return
                } catch {
                    // ignore
                }
            }

            addToast(`Checkout failed: ${message}`, "error", 6000)
            setCheckoutResponse(null)
            console.error(requestError)
        } finally {
            setIsCheckingOut(false)
        }
    }

    const handleCancelReservation = async () => {
        if (!checkoutResponse || paymentLoading) {
            return
        }

        try {
            setPaymentLoading(true)
            await cancelOrder(checkoutResponse.order.id)

            addToast(
                `Order #${checkoutResponse.order.id} reservation released. Inventory restored.`,
                "info",
                5000,
            )

            // Refresh inventory so product cards show restored stock
            const refreshedProducts = await getProducts()
            setProducts(
                refreshedProducts
                    .filter((product) => product.is_active)
                    .map(mapProduct),
            )

            // Start a fresh cart for the next order
            const newCart = await createCart()
            setCartId(newCart.id)
            setCartItems([])
            setCheckoutResponse(null)
            idempotencyKeyRef.current = null
        } catch (requestError) {
            const message =
                requestError instanceof Error
                    ? requestError.message
                    : "Unable to cancel reservation."
            addToast(`Unable to cancel reservation: ${message}`, "error", 6000)
        } finally {
            setPaymentLoading(false)
        }
    }

    const handleStartNewOrder = async () => {
        try {
            const newCart = await createCart()
            setCartId(newCart.id)
            setCartItems([])
            setCheckoutResponse(null)
            idempotencyKeyRef.current = null
        } catch (err) {
            console.error(err)
        }
    }

    const handlePayment = async (
        outcome: "success" | "failure" | "timeout",
    ) => {
        if (!checkoutResponse || paymentLoading) {
            return
        }

        const idempotencyKey =
            idempotencyKeyRef.current ??
            `pos-${checkoutResponse.order.id}-payment`

        try {
            setPaymentLoading(true)

            const response = await processPayment(
                checkoutResponse.order.id,
                {
                    idempotency_key: idempotencyKey,
                    outcome,
                },
            )

            const orderStatus =
                outcome === "success"
                    ? "Paid"
                    : outcome === "failure"
                        ? "Failed"
                        : "Expired"

            setCheckoutResponse((current) =>
                current
                    ? {
                        ...current,
                        order: {
                            ...current.order,
                            status: orderStatus,
                        },
                    }
                    : current,
            )

            if (outcome === "success") {
                addToast(
                    `Payment approved. Order #${response.order_id} is settled.`,
                    "success",
                    5000,
                )
            } else if (outcome === "failure") {
                addToast(
                    `Card declined. Order #${response.order_id} cancelled and stock returned.`,
                    "error",
                    6000,
                )
            } else {
                addToast(
                    `Payment timed out. Order #${response.order_id} expired and stock released.`,
                    "error",
                    6000,
                )
            }

            // Refresh inventory so product cards show current stock
            const refreshedProducts = await getProducts()
            setProducts(
                refreshedProducts
                    .filter((product) => product.is_active)
                    .map(mapProduct),
            )

            // Start a fresh cart for next order
            const newCart = await createCart()
            setCartId(newCart.id)
            setCartItems([])
            idempotencyKeyRef.current = null
        } catch (requestError) {
            const message =
                requestError instanceof Error
                    ? requestError.message
                    : "Payment failed."

            addToast(`Payment failed: ${message}`, "error", 6000)
            console.error(requestError)
        } finally {
            setPaymentLoading(false)
        }
    }

    const cartItemCount = cartItems.reduce(
        (total, item) => total + item.quantity,
        0,
    )

    // Format remaining countdown time (e.g., 04:35)
    const formatCountdown = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] min-h-0 bg-[#FAF8F5]">
            <section className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="mx-auto max-w-7xl">
                    {/* Catalog Header */}
                    <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <PackageSearch className="size-5 text-[#78350F]" />
                                <h2 className="font-serif-brand text-xl font-bold tracking-tight text-[#1C1917] sm:text-2xl">
                                    Artisan Menu &amp; Catalog
                                </h2>
                            </div>

                            <p className="mt-0.5 text-xs text-[#78716C] font-medium">
                                Specialty roasts, cold brews, and fresh bakery items. Tap to stage on ticket.
                            </p>
                        </div>

                        <div className="flex items-center gap-2 mt-2 sm:mt-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#E8E3DB] px-3 py-1 text-xs font-semibold text-[#57534E]">
                                <ShieldCheck className="size-3.5 text-[#4E6047]" />
                                Concurrency Protection Active
                            </span>
                        </div>
                    </div>

                    {/* Toolbar with Categories and Filters */}
                    <ProductToolbar
                        search={search}
                        onSearchChange={setSearch}
                        stockFilter={stockFilter}
                        onStockFilterChange={setStockFilter}
                        categoryFilter={categoryFilter}
                        onCategoryFilterChange={setCategoryFilter}
                    />

                    {/* Register Settlement Terminal (When Order is Active/Settling) */}
                    {checkoutResponse && (
                        <div
                            className={[
                                "mt-5 rounded-2xl border p-4.5 shadow-sm transition-all duration-200",
                                checkoutResponse.order.status === "Reserved"
                                    ? "border-[#F7E0B5] bg-[#FEF8EC]"
                                    : checkoutResponse.order.status === "Paid"
                                        ? "border-[#C8E3CE] bg-[#EDF6EE]"
                                        : "border-[#F8C8C8] bg-[#FDF2F2]",
                            ].join(" ")}
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E8E3DB]/80">
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <CreditCard className="size-4.5 text-[#78350F]" />
                                        <p className="font-serif-brand text-base font-bold text-[#1C1917]">
                                            Order #{checkoutResponse.order.id} Settlement
                                        </p>
                                    </div>

                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#78716C]">
                                        <span>Status: <strong className="font-semibold text-[#1C1917]">{checkoutResponse.order.status}</strong></span>
                                        {checkoutResponse.order.status === "Reserved" && remainingSeconds !== null && (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#F7E0B5] px-2.5 py-0.5 text-xs font-bold text-[#8C4E08]">
                                                <Clock className="size-3 text-[#B45309]" />
                                                Stock Hold: <span className="tnum font-extrabold">{formatCountdown(remainingSeconds)}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <span
                                    className={`self-start sm:self-center inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                                        checkoutResponse.order.status === "Paid"
                                            ? "bg-white text-[#215A36] border-[#C8E3CE]"
                                            : checkoutResponse.order.status === "Reserved"
                                                ? "bg-white text-[#8C4E08] border-[#F7E0B5]"
                                                : "bg-white text-[#9B2C2C] border-[#F8C8C8]"
                                    }`}
                                >
                                    <span
                                        className={`size-1.5 rounded-full ${
                                            checkoutResponse.order.status === "Paid"
                                                ? "bg-[#4E6047]"
                                                : checkoutResponse.order.status === "Reserved"
                                                    ? "bg-[#B45309] animate-pulse"
                                                    : "bg-[#9B2C2C]"
                                        }`}
                                    />
                                    {checkoutResponse.order.status}
                                </span>
                            </div>

                            <div className="pt-3">
                                {checkoutResponse.order.status === "Reserved" ? (
                                    <>
                                        <div className="flex items-center justify-between text-xs text-[#78716C]">
                                            <p className="font-medium">
                                                Simulate POS payment outcome for customer card/cash:
                                            </p>
                                            <span className="text-[11px] font-semibold text-[#78350F]">
                                                Idempotency Key Active
                                            </span>
                                        </div>

                                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            <button
                                                type="button"
                                                disabled={paymentLoading}
                                                onClick={() => void handlePayment("success")}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#215A36] px-3.5 text-xs font-bold text-white shadow-xs hover:bg-[#184428] disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 transition-all"
                                            >
                                                <CheckCircle2 className="size-4" />
                                                Approve Payment
                                            </button>

                                            <button
                                                type="button"
                                                disabled={paymentLoading}
                                                onClick={() => void handlePayment("failure")}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#9B2C2C] px-3.5 text-xs font-bold text-white shadow-xs hover:bg-[#7D2323] disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 transition-all"
                                            >
                                                <XCircle className="size-4" />
                                                Decline Card
                                            </button>

                                            <button
                                                type="button"
                                                disabled={paymentLoading}
                                                onClick={() => void handlePayment("timeout")}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1C1917] px-3.5 text-xs font-bold text-white shadow-xs hover:bg-[#292524] disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 transition-all"
                                            >
                                                <Clock className="size-4" />
                                                Simulate Timeout
                                            </button>

                                            <button
                                                type="button"
                                                disabled={paymentLoading}
                                                onClick={() => void handleCancelReservation()}
                                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D8D1C5] bg-white px-3.5 text-xs font-bold text-[#78350F] hover:bg-[#FAF8F5] disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 transition-all"
                                            >
                                                <Undo2 className="size-4" />
                                                Release Hold
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E8E3DB] rounded-xl p-3">
                                        <p className="text-xs font-medium text-[#1C1917]">
                                            Order #{checkoutResponse.order.id} status is <strong>{checkoutResponse.order.status}</strong>. Customer transaction complete.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => void handleStartNewOrder()}
                                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#78350F] px-4 text-xs font-bold text-white hover:bg-[#5A270B] active:scale-95 transition-all shadow-xs"
                                        >
                                            Start Next Order
                                            <ArrowRight className="size-3.5" />
                                        </button>
                                    </div>
                                )}

                                {paymentLoading && (
                                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#78350F]">
                                        <Loader2 className="size-3.5 animate-spin" />
                                        Processing transaction through secure POS gateway...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Products Grid */}
                    <div className="mt-5">
                        {loading ? (
                            <div className="flex min-h-80 items-center justify-center rounded-2xl border border-[#E8E3DB] bg-white">
                                <div className="flex items-center gap-2 text-sm text-[#78716C]">
                                    <Loader2 className="size-4 animate-spin text-[#78350F]" />
                                    Loading café catalog...
                                </div>
                            </div>
                        ) : error ? (
                            <div className="flex min-h-80 items-center justify-center rounded-2xl border border-[#F8C8C8] bg-[#FDF2F2]">
                                <div className="text-center">
                                    <p className="font-serif-brand text-sm font-semibold text-[#9B2C2C]">
                                        Unable to Load Menu
                                    </p>
                                    <p className="mt-1 text-xs text-[#9B2C2C]/80">
                                        {error}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <ProductGrid
                                products={filteredProducts}
                                onAddToCart={addToCart}
                            />
                        )}
                    </div>
                </div>
            </section>

            {/* Desktop cart */}
            <aside className="hidden w-[380px] shrink-0 xl:block shadow-xs">
                <CartPanel
                    items={cartItems}
                    onIncrease={increaseQuantity}
                    onDecrease={decreaseQuantity}
                    onRemove={removeFromCart}
                    onCheckout={handleCheckout}
                    isCheckingOut={isCheckingOut}
                    reservedOrderId={
                        checkoutResponse && checkoutResponse.order.status === "Reserved"
                            ? checkoutResponse.order.id
                            : null
                    }
                />
            </aside>

            {/* Mobile cart floating action button */}
            <div className="fixed bottom-5 right-5 z-40 xl:hidden">
                <button
                    type="button"
                    onClick={() => setMobileCartOpen(true)}
                    className="flex items-center gap-2.5 rounded-full bg-[#1C1917] px-5 py-3.5 text-sm font-bold text-white shadow-xl shadow-[#1C1917]/25 hover:bg-[#78350F] active:scale-95 transition-all"
                >
                    <ShoppingCart className="size-4" />
                    <span>Order Ticket</span>
                    <span className="flex size-5 items-center justify-center rounded-full bg-[#78350F] text-[11px] font-extrabold text-white">
                        {cartItemCount}
                    </span>
                </button>
            </div>

            {/* Mobile cart drawer */}
            {mobileCartOpen && (
                <div className="fixed inset-0 z-50 xl:hidden">
                    <button
                        type="button"
                        aria-label="Close cart"
                        onClick={() => setMobileCartOpen(false)}
                        className="absolute inset-0 bg-black/40 backdrop-blur-2xs"
                    />

                    <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
                        <CartPanel
                            items={cartItems}
                            onIncrease={increaseQuantity}
                            onDecrease={decreaseQuantity}
                            onRemove={removeFromCart}
                            onCheckout={() => {
                                setMobileCartOpen(false)
                                void handleCheckout()
                            }}
                            onClose={() => setMobileCartOpen(false)}
                            isCheckingOut={isCheckingOut}
                            reservedOrderId={
                                checkoutResponse && checkoutResponse.order.status === "Reserved"
                                    ? checkoutResponse.order.id
                                    : null
                            }
                        />
                    </div>
                </div>
            )}
            <ToastStack toasts={toasts} onDismiss={removeToast} />
        </div>
    )
}
