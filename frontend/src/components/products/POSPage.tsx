import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    ArrowRight,
    BookmarkCheck,
    CheckCircle2,
    Clock,
    CreditCard,
    DollarSign,
    Loader2,
    PackageSearch,
    Printer,
    ShoppingCart,
} from "lucide-react"
import { ToastStack, type ToastItemData, type ToastVariant } from "../ui/Toast"

import {
    addCartItem,
    applyCartDiscount,
    cancelOrder,
    checkoutCart,
    createCart,
    getCart,
    getOrder,
    getParkedCarts,
    getProducts,
    parkCart,
    processPayment,
    removeCartItem,
    resumeCart,
    updateCartItemQuantity,
    getProductByBarcode,
    createProduct,
    type Cart as ApiCart,
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
import { ReceiptModal } from "../orders/ReceiptModal"
import { BarcodeScannerModal } from "../common/BarcodeScannerModal"
import { useBarcodeScanner } from "../../hooks/useBarcodeScanner"
import { playScanSound } from "../../lib/sound"
import { resolveBarcodeData } from "../../lib/barcodeParser"
import { getCachedProducts, saveCachedProducts } from "../../lib/offlineStore"

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
        category: product.category,
        barcode: product.barcode,
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
    const [parkedCarts, setParkedCarts] = useState<ApiCart[]>([])
    const [discountPercent, setDiscountPercent] = useState<number>(0)
    const [discountReason, setDiscountReason] = useState<string | null>(null)
    const [tenderMethod, setTenderMethod] = useState<"cash" | "card">("cash")
    const [cashTendered, setCashTendered] = useState<string>("")
    const [cardRefId, setCardRefId] = useState<string>("")
    const [showReceiptModal, setShowReceiptModal] = useState(false)
    const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false)
    const isScanningRef = useRef(false)

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
                    const mapped = response
                        .filter((product) => product.is_active)
                        .map(mapProduct)
                    setProducts(mapped)
                    void saveCachedProducts(mapped)
                }
            } catch (requestError) {
                const cached = await getCachedProducts<Product>()
                if (!cancelled && cached.length > 0) {
                    setProducts(cached)
                } else if (!cancelled && isInitial) {
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
        const noSpacesSearch = normalizedSearch.replace(/\s+/g, "")

        return products.filter((product) => {
            const matchesSearch =
                !normalizedSearch ||
                product.name.toLowerCase().includes(normalizedSearch) ||
                (product.barcode &&
                    (product.barcode.toLowerCase().includes(normalizedSearch) ||
                        product.barcode.toLowerCase().includes(noSpacesSearch)))

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
                const cat = (product.category || "").toLowerCase()
                const name = product.name.toLowerCase()
                if (categoryFilter === "coffee") {
                    matchesCategory = cat.includes("coffee") || name.includes("espresso") || name.includes("latte") || name.includes("cappuccino")
                } else if (categoryFilter === "cold") {
                    matchesCategory = cat.includes("cold") || name.includes("cold") || name.includes("iced")
                } else if (categoryFilter === "tea") {
                    matchesCategory = cat.includes("tea") || name.includes("matcha") || name.includes("tea")
                } else if (categoryFilter === "bakery") {
                    matchesCategory = cat.includes("bakery") || name.includes("croissant") || name.includes("muffin")
                } else if (categoryFilter === "retail") {
                    matchesCategory = cat.includes("retail") || name.includes("bean") || name.includes("bottle")
                }
            }

            return matchesSearch && matchesStock && matchesCategory
        })
    }, [products, search, stockFilter, categoryFilter])

    const addToCart = useCallback(
        async (productId: number) => {
            const product = products.find((item) => item.id === productId)

            if (!product || product.stock <= 0) {
                return
            }

            if (
                checkoutResponse &&
                checkoutResponse.order.status === "Reserved"
            ) {
                addToast(
                    `Order #${checkoutResponse.order.id} is awaiting payment. Complete or cancel it before starting a new order.`,
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
                        : "Couldn't add item to order."

                if (message.includes("Cart is not active")) {
                    try {
                        const freshCart = await createCart()
                        setCartId(freshCart.id)
                        setCartItems([])
                        setCheckoutResponse(null)
                        await addCartItem(freshCart.id, productId, 1)
                    } catch {
                        addToast("Couldn't add item to order.", "error", 5000)
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
        },
        [products, checkoutResponse, cartId, addToast],
    )

    const handleBarcodeScan = useCallback(
        async (scannedCode: string) => {
            const cleaned = scannedCode.trim()
            if (!cleaned || isScanningRef.current) return
            isScanningRef.current = true

            try {
                const noSpaces = cleaned.replace(/\s+/g, "")
                const searchCode =
                    /^\d+$/.test(noSpaces) && noSpaces.length >= 3 ? noSpaces : cleaned

                // 1. Try finding in loaded products list
                let matchedProduct = products.find(
                    (p) =>
                        p.barcode &&
                        (p.barcode.toLowerCase() === cleaned.toLowerCase() ||
                            p.barcode.toLowerCase() === searchCode.toLowerCase()),
                )

                // 2. Query backend if not found in current memory list
                if (!matchedProduct) {
                    try {
                        const apiProd = await getProductByBarcode(searchCode)
                        if (apiProd && apiProd.is_active) {
                            matchedProduct = mapProduct(apiProd)
                        }
                    } catch {
                        try {
                            const apiProd = await getProductByBarcode(cleaned)
                            if (apiProd && apiProd.is_active) {
                                matchedProduct = mapProduct(apiProd)
                            }
                        } catch {
                            // Not found on server
                        }
                    }
                }

                // 3. If still not matched, check if rich QR code or barcode metadata contains name and price
                if (!matchedProduct) {
                    const resolved = await resolveBarcodeData(cleaned)
                    if (resolved.name && resolved.price && resolved.price > 0) {
                        try {
                            const newProd = await createProduct({
                                name: resolved.name,
                                price: resolved.price,
                                available_stock: 50,
                                barcode: resolved.barcode || searchCode,
                                category: resolved.category || "Coffee",
                            })
                            matchedProduct = mapProduct(newProd)
                            setProducts((prev) => [...prev, matchedProduct!])
                            addToast(
                                `Auto-registered "${resolved.name}" ($${resolved.price.toFixed(2)}) from barcode!`,
                                "success",
                                4000,
                            )
                        } catch {
                            // Non-manager or creation error
                        }
                    }
                }

                if (!matchedProduct) {
                    playScanSound("error")
                    addToast(
                        `No product found with barcode "${cleaned}". Please add this item in Stock before selling.`,
                        "error",
                        5000,
                    )
                    return
                }

                if (matchedProduct.stock <= 0) {
                    playScanSound("error")
                    addToast(`"${matchedProduct.name}" is currently out of stock.`, "error", 4500)
                    return
                }

                if (
                    checkoutResponse &&
                    checkoutResponse.order.status === "Reserved"
                ) {
                    playScanSound("error")
                    addToast(
                        `Order #${checkoutResponse.order.id} is awaiting payment. Complete or cancel it before scanning new items.`,
                        "info",
                        5000,
                    )
                    return
                }

                await addToCart(matchedProduct.id)
                playScanSound("success")
                addToast(
                    `Scanned: ${matchedProduct.name} (${matchedProduct.barcode || cleaned})`,
                    "success",
                    3000,
                )
            } catch (scanErr) {
                playScanSound("error")
                addToast(
                    scanErr instanceof Error
                        ? scanErr.message
                        : "Unable to process scanned barcode.",
                    "error",
                    4500,
                )
            } finally {
                setTimeout(() => {
                    isScanningRef.current = false
                }, 350)
            }
        },
        [products, checkoutResponse, addToCart, addToast],
    )

    // Keyboard-wedge physical USB / Bluetooth barcode scanner listener
    useBarcodeScanner({
        onScan: (barcode) => {
            void handleBarcodeScan(barcode)
        },
        enabled: true,
    })

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
                    : "Couldn't update quantity.",
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
                    : "Couldn't update quantity.",
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
                    : "Couldn't remove item.",
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
                `Order #${response.order.id} created. Items held until ${expiryTime}.`,
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
                    : "Couldn't complete sale."

            if (message.includes("Cart is not active")) {
                try {
                    const freshCart = await createCart()
                    setCartId(freshCart.id)
                    setCartItems([])
                    setCheckoutResponse(null)
                    addToast(
                        "The previous order was completed. A new order has been started.",
                        "error",
                        6000,
                    )
                    return
                } catch {
                    // ignore
                }
            }

            addToast(`Couldn't complete sale: ${message}`, "error", 6000)
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
                `Order #${checkoutResponse.order.id} cancelled. Items returned to stock.`,
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
                    : "Couldn't cancel order."
            addToast(`Couldn't cancel order: ${message}`, "error", 6000)
        } finally {
            setPaymentLoading(false)
        }
    }

    const loadParkedCarts = useCallback(async () => {
        try {
            const list = await getParkedCarts()
            setParkedCarts(list)
        } catch {
            // ignore
        }
    }, [])

    useEffect(() => {
        let ignore = false
        getParkedCarts()
            .then((list) => {
                if (!ignore) {
                    setParkedCarts(list)
                }
            })
            .catch(() => {})
        return () => {
            ignore = true
        }
    }, [])

    const handleParkOrder = async (label: string) => {
        if (!cartId || cartItems.length === 0) return
        try {
            await parkCart(cartId, label)
            addToast(`Order parked for "${label}". Started fresh order.`, "success", 4000)
            const freshCart = await createCart()
            setCartId(freshCart.id)
            setCartItems([])
            setDiscountPercent(0)
            setDiscountReason(null)
            void loadParkedCarts()
        } catch (err) {
            addToast(err instanceof Error ? err.message : "Couldn't park order", "error")
        }
    }

    const handleResumeParkedCart = async (parked: ApiCart) => {
        try {
            await resumeCart(parked.id)
            setCartId(parked.id)
            setCartItems(
                parked.items.map((i) => {
                    const prod = products.find((p) => p.id === i.product_id)
                    return {
                        id: i.product_id,
                        name: prod ? prod.name : `Item #${i.product_id}`,
                        price: prod ? prod.price : 0,
                        quantity: i.quantity,
                        notes: i.notes,
                    }
                }),
            )
            setDiscountPercent(parked.discount_percent || 0)
            setDiscountReason(parked.discount_reason || null)
            setCheckoutResponse(null)
            addToast(`Resumed parked order "${parked.label || `#${parked.id}`}".`, "info", 4000)
            void loadParkedCarts()
        } catch (err) {
            addToast(err instanceof Error ? err.message : "Couldn't resume order", "error")
        }
    }

    const handleApplyDiscount = async (percent: number, reason: string) => {
        if (!cartId) return
        try {
            await applyCartDiscount(cartId, percent, reason)
            setDiscountPercent(percent)
            setDiscountReason(reason)
            addToast(`Applied ${percent}% discount (${reason}).`, "success", 4000)
        } catch (err) {
            addToast(err instanceof Error ? err.message : "Couldn't apply discount", "error")
        }
    }

    const handleUpdateNotes = (productId: number, notes: string) => {
        setCartItems((prev) =>
            prev.map((item) => (item.id === productId ? { ...item, notes } : item)),
        )
        addToast("Note attached to item.", "success", 2500)
    }

    const handleStartNewOrder = async () => {
        try {
            const newCart = await createCart()
            setCartId(newCart.id)
            setCartItems([])
            setDiscountPercent(0)
            setDiscountReason(null)
            setCashTendered("")
            setCardRefId("")
            setCheckoutResponse(null)
            idempotencyKeyRef.current = null
        } catch (err) {
            console.error(err)
        }
    }

    const orderSubtotal = cartItems.reduce(
        (total, item) => total + item.price * item.quantity,
        0,
    )
    const orderDiscountAmount = discountPercent > 0 ? (orderSubtotal * discountPercent) / 100 : 0
    const orderTotalAmount = Math.max(0, orderSubtotal - orderDiscountAmount)
    const tenderedVal = parseFloat(cashTendered) || 0
    const changeDueAmount = Math.max(0, tenderedVal - orderTotalAmount)

    const handlePayment = async (
        outcome: "success" | "failure" | "timeout",
    ) => {
        if (!checkoutResponse || paymentLoading) {
            return
        }

        const idempotencyKey =
            idempotencyKeyRef.current ??
            `pos-${checkoutResponse.order.id}-payment`

        const isCash = tenderMethod === "cash"
        const tendered = isCash ? (tenderedVal > 0 ? tenderedVal : orderTotalAmount) : undefined
        const change = isCash ? (tenderedVal >= orderTotalAmount ? tenderedVal - orderTotalAmount : 0) : undefined

        try {
            setPaymentLoading(true)

            const response = await processPayment(
                checkoutResponse.order.id,
                {
                    idempotency_key: idempotencyKey,
                    outcome,
                    method: tenderMethod,
                    amount_tendered: tendered,
                    change_due: change,
                    reference_id: !isCash && cardRefId.trim() ? cardRefId.trim() : undefined,
                },
            )

            const orderStatus =
                outcome === "success"
                    ? "Paid"
                    : outcome === "failure"
                        ? "Failed"
                        : "Expired"

            const finalOrder = {
                ...checkoutResponse.order,
                status: orderStatus,
                discount_percent: discountPercent,
                discount_amount: orderDiscountAmount,
                discount_reason: discountReason,
                payment: {
                    id: response.id,
                    order_id: response.order_id,
                    idempotency_key: response.idempotency_key,
                    status: response.status,
                    method: tenderMethod,
                    amount_tendered: tendered ?? null,
                    change_due: change ?? null,
                    reference_id: !isCash ? cardRefId : null,
                    processed_at: response.processed_at,
                },
            }

            setCheckoutResponse({
                ...checkoutResponse,
                order: finalOrder,
            })

            if (outcome === "success") {
                addToast(
                    `Payment received via ${tenderMethod.toUpperCase()}. Order #${response.order_id} complete.`,
                    "success",
                    5000,
                )
                setShowReceiptModal(true)
            } else if (outcome === "failure") {
                addToast(
                    `Payment declined. Order #${response.order_id} cancelled.`,
                    "error",
                    6000,
                )
            } else {
                addToast(
                    `Payment timed out. Items returned to stock.`,
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
            setDiscountPercent(0)
            setDiscountReason(null)
            setCashTendered("")
            setCardRefId("")
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
                                    Menu
                                </h2>
                            </div>

                            <p className="mt-0.5 text-xs text-[#78716C] font-medium">
                                Select items to add to the order.
                            </p>
                        </div>
                    </div>

                    {/* Parked Orders Bar */}
                    {parkedCarts.length > 0 && (
                        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#F7E0B5] bg-[#FEF8EC] p-3 shadow-2xs">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-[#8C4E08] mr-2">
                                <BookmarkCheck className="size-4 text-[#B45309]" />
                                <span>Held Orders ({parkedCarts.length}):</span>
                            </div>
                            {parkedCarts.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => void handleResumeParkedCart(p)}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 text-xs font-bold text-[#1C1917] hover:border-[#78350F] hover:bg-[#FAF8F5] transition-all shadow-2xs"
                                >
                                    <span className="size-2 rounded-full bg-[#B45309]" />
                                    <span>{p.label || `Order #${p.id}`}</span>
                                    <span className="text-[10px] text-stone-400">({p.items.length} items)</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Toolbar with Categories and Filters */}
                    <ProductToolbar
                        search={search}
                        onSearchChange={setSearch}
                        stockFilter={stockFilter}
                        onStockFilterChange={setStockFilter}
                        categoryFilter={categoryFilter}
                        onCategoryFilterChange={setCategoryFilter}
                        onScanBarcodeClick={() => setIsBarcodeScannerOpen(true)}
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
                                            Order #{checkoutResponse.order.id}
                                        </p>
                                    </div>

                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#78716C]">
                                        <span>Status: <strong className="font-semibold text-[#1C1917]">{checkoutResponse.order.status}</strong></span>
                                        {checkoutResponse.order.status === "Reserved" && remainingSeconds !== null && (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#F7E0B5] px-2.5 py-0.5 text-xs font-bold text-[#8C4E08]">
                                                <Clock className="size-3 text-[#B45309]" />
                                                Held: <span className="tnum font-extrabold">{formatCountdown(remainingSeconds)}</span>
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
                                    <div className="space-y-3">
                                        {/* Tender method selector */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setTenderMethod("cash")}
                                                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold border transition-all ${
                                                    tenderMethod === "cash"
                                                        ? "bg-[#78350F] text-white border-[#78350F] shadow-xs"
                                                        : "bg-white text-stone-700 border-[#E8E3DB] hover:bg-[#FAF8F5]"
                                                }`}
                                            >
                                                <DollarSign className="size-4" />
                                                <span>Cash Tender</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTenderMethod("card")}
                                                className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold border transition-all ${
                                                    tenderMethod === "card"
                                                        ? "bg-[#78350F] text-white border-[#78350F] shadow-xs"
                                                        : "bg-white text-stone-700 border-[#E8E3DB] hover:bg-[#FAF8F5]"
                                                }`}
                                            >
                                                <CreditCard className="size-4" />
                                                <span>Card Terminal</span>
                                            </button>
                                        </div>

                                        {/* Amount to pay display */}
                                        <div className="rounded-xl bg-white border border-[#E8E3DB] p-3 flex items-center justify-between">
                                            <div>
                                                <p className="text-[11px] font-medium text-stone-500">Total Amount Due</p>
                                                <p className="font-serif-brand text-lg font-bold text-[#1C1917]">
                                                    ${orderTotalAmount.toFixed(2)}
                                                </p>
                                            </div>
                                            {tenderMethod === "cash" && changeDueAmount > 0 && (
                                                <div className="text-right">
                                                    <p className="text-[11px] font-medium text-[#215A36]">Change Due</p>
                                                    <p className="font-serif-brand text-lg font-extrabold text-[#215A36]">
                                                        ${changeDueAmount.toFixed(2)}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {tenderMethod === "cash" ? (
                                            <div className="space-y-2">
                                                {/* Quick Cash Presets */}
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[
                                                        { label: `Exact ($${orderTotalAmount.toFixed(2)})`, val: orderTotalAmount.toFixed(2) },
                                                        { label: "$10.00", val: "10.00" },
                                                        { label: "$20.00", val: "20.00" },
                                                        { label: "$50.00", val: "50.00" },
                                                        { label: "$100.00", val: "100.00" },
                                                    ].map((preset) => (
                                                        <button
                                                            key={preset.label}
                                                            type="button"
                                                            onClick={() => setCashTendered(preset.val)}
                                                            className="rounded-lg border border-[#E8E3DB] bg-white px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-50 shadow-2xs"
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                <div className="flex gap-2">
                                                    <div className="relative flex-1">
                                                        <DollarSign className="absolute left-3 top-2.5 size-4 text-stone-400" />
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={cashTendered}
                                                            onChange={(e) => setCashTendered(e.target.value)}
                                                            placeholder="Cash tendered"
                                                            className="w-full rounded-xl border border-[#E8E3DB] bg-white py-2 pl-9 pr-3 text-xs font-semibold text-[#1C1917] focus:border-[#78350F] focus:outline-hidden"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        disabled={paymentLoading || (tenderedVal < orderTotalAmount && tenderedVal !== 0)}
                                                        onClick={() => void handlePayment("success")}
                                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#215A36] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#184428] disabled:opacity-40"
                                                    >
                                                        <CheckCircle2 className="size-3.5" />
                                                        Complete Cash Sale
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={cardRefId}
                                                    onChange={(e) => setCardRefId(e.target.value)}
                                                    placeholder="Terminal Auth Code / Ref # (Optional)"
                                                    className="flex-1 rounded-xl border border-[#E8E3DB] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] focus:border-[#78350F] focus:outline-hidden"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={paymentLoading}
                                                    onClick={() => void handlePayment("success")}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#215A36] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#184428] disabled:opacity-40"
                                                >
                                                    <CheckCircle2 className="size-3.5" />
                                                    Complete Card Sale
                                                </button>
                                            </div>
                                        )}

                                        {/* Simulation / Emergency actions */}
                                        <div className="flex items-center justify-between pt-2 border-t border-[#E8E3DB]/70 text-[11px] text-stone-500">
                                            <span>Simulation / Action:</span>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    disabled={paymentLoading}
                                                    onClick={() => void handlePayment("failure")}
                                                    className="text-[#9B2C2C] hover:underline"
                                                >
                                                    Decline
                                                </button>
                                                <span>·</span>
                                                <button
                                                    type="button"
                                                    disabled={paymentLoading}
                                                    onClick={() => void handlePayment("timeout")}
                                                    className="text-stone-600 hover:underline"
                                                >
                                                    Timeout
                                                </button>
                                                <span>·</span>
                                                <button
                                                    type="button"
                                                    disabled={paymentLoading}
                                                    onClick={() => void handleCancelReservation()}
                                                    className="text-[#78350F] font-semibold hover:underline"
                                                >
                                                    Cancel Order
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E8E3DB] rounded-xl p-3.5">
                                        <div>
                                            <p className="text-xs font-bold text-[#1C1917]">
                                                Order #{checkoutResponse.order.id} is {checkoutResponse.order.status.toLowerCase()}.
                                            </p>
                                            {checkoutResponse.order.payment && (
                                                <p className="text-[11px] text-stone-500">
                                                    Paid via {checkoutResponse.order.payment.method.toUpperCase()}
                                                    {checkoutResponse.order.payment.change_due ? ` · Change: $${Number(checkoutResponse.order.payment.change_due).toFixed(2)}` : ""}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowReceiptModal(true)}
                                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#78350F] bg-white px-3.5 text-xs font-bold text-[#78350F] hover:bg-[#FEF8EC] transition-all"
                                            >
                                                <Printer className="size-3.5" />
                                                Receipt
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleStartNewOrder()}
                                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#78350F] px-4 text-xs font-bold text-white hover:bg-[#5A270B] active:scale-95 transition-all shadow-xs"
                                            >
                                                New Order
                                                <ArrowRight className="size-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {paymentLoading && (
                                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#78350F]">
                                        <Loader2 className="size-3.5 animate-spin" />
                                        Processing payment...
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
                                    Loading products...
                                </div>
                            </div>
                        ) : error ? (
                            <div className="flex min-h-80 items-center justify-center rounded-2xl border border-[#F8C8C8] bg-[#FDF2F2]">
                                <div className="text-center">
                                    <p className="font-serif-brand text-sm font-semibold text-[#9B2C2C]">
                                        Couldn't load products
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
                    discountPercent={discountPercent}
                    discountReason={discountReason}
                    onIncrease={increaseQuantity}
                    onDecrease={decreaseQuantity}
                    onRemove={removeFromCart}
                    onCheckout={handleCheckout}
                    onParkOrder={handleParkOrder}
                    onApplyDiscount={handleApplyDiscount}
                    onUpdateNotes={handleUpdateNotes}
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
                    <span>Current Order</span>
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
                            discountPercent={discountPercent}
                            discountReason={discountReason}
                            onIncrease={increaseQuantity}
                            onDecrease={decreaseQuantity}
                            onRemove={removeFromCart}
                            onCheckout={() => {
                                setMobileCartOpen(false)
                                void handleCheckout()
                            }}
                            onClose={() => setMobileCartOpen(false)}
                            onParkOrder={handleParkOrder}
                            onApplyDiscount={handleApplyDiscount}
                            onUpdateNotes={handleUpdateNotes}
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

            {/* Printable Receipt Modal */}
            <ReceiptModal
                order={checkoutResponse?.order || null}
                isOpen={showReceiptModal}
                onClose={() => setShowReceiptModal(false)}
            />

            {/* Camera & Barcode Scanner Modal */}
            <BarcodeScannerModal
                isOpen={isBarcodeScannerOpen}
                onClose={() => setIsBarcodeScannerOpen(false)}
                onScan={(code) => void handleBarcodeScan(code)}
                title="Scan Barcode into POS"
                subtitle="Position barcode in camera viewfinder or type below."
            />

            <ToastStack toasts={toasts} onDismiss={removeToast} />
        </div>
    )
}
