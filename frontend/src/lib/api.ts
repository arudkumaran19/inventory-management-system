import type { CreateUserData, LoginResponse, UpdateUserData, User } from "../types/auth"

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL ??
    (typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "http://localhost:8000"
        : "http://127.0.0.1:8000")

export type Product = {
    id: number
    name: string
    price: string
    available_stock: number
    category: string
    barcode?: string | null
    is_active: boolean
}

export type ProductCreate = {
    name: string
    price: number
    available_stock: number
    category?: string
    barcode?: string | null
}

export type ProductUpdate = {
    name?: string
    price?: number
    available_stock?: number
    category?: string
    barcode?: string | null
    is_active?: boolean
    adjustment_reason?: string
}

export type InventoryLog = {
    id: number
    product_id: number
    user_id?: number | null
    previous_stock: number
    new_stock: number
    change_amount: number
    reason: string
    created_at: string
}

export type CartItem = {
    product_id: number
    quantity: number
    notes?: string | null
}

export type Cart = {
    id: number
    status: string
    label?: string | null
    discount_percent?: number
    discount_reason?: string | null
    items: CartItem[]
}

export type OrderItem = {
    product_id: number
    product_name: string
    quantity: number
    unit_price: string
    notes?: string | null
}

export type HandledBy = {
    id: number
    display_name: string
    email: string
    role: string
}

export type PaymentResponse = {
    id: number
    order_id: number
    idempotency_key: string
    status: string
    method: string
    amount_tendered?: number | null
    change_due?: number | null
    reference_id?: string | null
    processed_at: string | null
}

export type Order = {
    id: number
    cart_id: number
    status: string
    discount_percent?: number
    discount_amount?: number
    discount_reason?: string | null
    table_or_customer?: string | null
    payment?: PaymentResponse | null
    items: OrderItem[]
    created_at: string        // ISO-8601 UTC
    completed_at: string | null
    handled_by: HandledBy | null
}

export type CheckoutResponse = {
    order: Order
    reservation_expires_at: string
}

export type PaymentOutcome = "success" | "failure" | "timeout"

export type PaymentRequest = {
    idempotency_key: string
    outcome: PaymentOutcome
    method?: string
    amount_tendered?: number
    change_due?: number
    reference_id?: string
}

export type RegisterShift = {
    id: number
    user_id: number
    opened_at: string
    closed_at?: string | null
    opening_float: number
    closing_cash_actual?: number | null
    expected_cash?: number | null
    card_total: number
    status: string
    notes?: string | null
}

export type ShiftSummary = {
    shift: RegisterShift
    cash_sales: number
    card_sales: number
    total_sales: number
    total_orders: number
    expected_cash: number
    variance?: number | null
}

export type OrderAnalytics = {
    gross_sales: number
    net_sales: number
    tax_included: number
    total_refunds: number
    paid_orders_count: number
    cancelled_orders_count: number
    avg_order_value: number
    top_products: Array<{ name: string; quantity: number; revenue: number }>
}

let onUnauthorizedCallback: (() => void) | null = null

export function setOnUnauthorized(callback: (() => void) | null) {
    onUnauthorizedCallback = callback
}

async function request<T>(
    path: string,
    options?: RequestInit,
): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...options?.headers,
        },
        ...options,
    })

    if (!response.ok) {
        if (response.status === 401 && !path.startsWith("/auth/login")) {
            onUnauthorizedCallback?.()
        }

        let message = `Request failed with status ${response.status}`

        try {
            const error = await response.json()

            if (typeof error?.detail === "string") {
                message = error.detail
            } else if (Array.isArray(error?.detail)) {
                // FastAPI 422 validation errors — each entry has msg + loc
                message = error.detail
                    .map((e: { msg?: string; loc?: string[] }) =>
                        e.msg ?? JSON.stringify(e),
                    )
                    .join("; ")
            }
        } catch {
            // Keep the default HTTP error message.
        }

        throw new Error(message)
    }

    if (response.status === 204) {
        return undefined as T
    }

    return response.json() as Promise<T>
}

export async function login(
    email: string,
    password: string,
): Promise<LoginResponse> {
    return request<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    })
}

export async function logout(): Promise<void> {
    return request<void>("/auth/logout", {
        method: "POST",
    })
}

export async function getMe(): Promise<User> {
    return request<User>("/auth/me")
}

export async function getUsers(): Promise<User[]> {
    return request<User[]>("/users")
}

export async function createUser(data: CreateUserData): Promise<User> {
    return request<User>("/users", {
        method: "POST",
        body: JSON.stringify(data),
    })
}

export async function updateUser(
    userId: number,
    data: UpdateUserData,
): Promise<User> {
    return request<User>(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
    })
}

export async function deleteUser(userId: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/users/${userId}`, {
        method: "DELETE",
    })
}

export async function getProducts(): Promise<Product[]> {
    return request<Product[]>("/products")
}

export async function getProduct(productId: number): Promise<Product> {
    return request<Product>(`/products/${productId}`)
}

export async function getProductByBarcode(barcode: string): Promise<Product> {
    return request<Product>(`/products/by-barcode/${encodeURIComponent(barcode.trim())}`)
}

export async function createProduct(
    product: ProductCreate,
): Promise<Product> {
    return request<Product>("/products", {
        method: "POST",
        body: JSON.stringify(product),
    })
}

export async function updateProduct(
    productId: number,
    product: ProductUpdate,
): Promise<Product> {
    return request<Product>(`/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify(product),
    })
}

export async function deleteProduct(productId: number): Promise<void> {
    return request<void>(`/products/${productId}`, {
        method: "DELETE",
    })
}

export async function createCart(): Promise<Cart> {
    return request<Cart>("/carts", {
        method: "POST",
        body: JSON.stringify({}),
    })
}

export async function getCart(cartId: number): Promise<Cart> {
    return request<Cart>(`/carts/${cartId}`)
}

export async function addCartItem(
    cartId: number,
    productId: number,
    quantity: number,
    notes?: string,
): Promise<Cart> {
    return request<Cart>(`/carts/${cartId}/items`, {
        method: "POST",
        body: JSON.stringify({
            product_id: productId,
            quantity,
            notes,
        }),
    })
}

export async function removeCartItem(
    cartId: number,
    productId: number,
): Promise<Cart> {
    return request<Cart>(
        `/carts/${cartId}/items/${productId}`,
        {
            method: "DELETE",
        },
    )
}

export async function updateCartItemQuantity(
    cartId: number,
    productId: number,
    quantity: number,
): Promise<Cart> {
    return request<Cart>(
        `/carts/${cartId}/items/${productId}`,
        {
            method: "PATCH",
            body: JSON.stringify({
                quantity,
            }),
        },
    )
}


export async function checkoutCart(
    cartId: number,
): Promise<CheckoutResponse> {
    return request<CheckoutResponse>(
        `/carts/${cartId}/checkout`,
        {
            method: "POST",
        },
    )
}

export async function processPayment(
    orderId: number,
    payment: PaymentRequest,
): Promise<PaymentResponse> {
    return request<PaymentResponse>(
        `/payments/orders/${orderId}`,
        {
            method: "POST",
            body: JSON.stringify(payment),
        },
    )
}

export async function getOrders(
    userId?: number | null,
    status?: string | null,
    search?: string | null,
): Promise<Order[]> {
    const params = new URLSearchParams()
    if (userId !== undefined && userId !== null) {
        params.set("user_id", String(userId))
    }
    if (status && status !== "all") {
        params.set("status", status)
    }
    if (search && search.trim()) {
        params.set("search", search.trim())
    }
    const query = params.toString()
    return request<Order[]>(`/orders${query ? `?${query}` : ""}`)
}

export async function getOrder(orderId: number): Promise<Order> {
    return request<Order>(`/orders/${orderId}`)
}

export async function cancelOrder(orderId: number): Promise<Order> {
    return request<Order>(`/orders/${orderId}/cancel`, {
        method: "POST",
    })
}

export async function getInventoryLogs(): Promise<InventoryLog[]> {
    return request<InventoryLog[]>("/products/inventory/logs")
}

export async function getParkedCarts(): Promise<Cart[]> {
    return request<Cart[]>("/carts/parked")
}

export async function parkCart(cartId: number, label: string): Promise<Cart> {
    return request<Cart>(`/carts/${cartId}/park`, {
        method: "POST",
        body: JSON.stringify({ label }),
    })
}

export async function resumeCart(cartId: number): Promise<Cart> {
    return request<Cart>(`/carts/${cartId}/resume`, {
        method: "POST",
    })
}

export async function applyCartDiscount(
    cartId: number,
    percent: number,
    reason?: string,
): Promise<Cart> {
    return request<Cart>(`/carts/${cartId}/discount`, {
        method: "POST",
        body: JSON.stringify({
            discount_percent: percent,
            discount_reason: reason,
        }),
    })
}

export async function getCurrentShift(): Promise<ShiftSummary | null> {
    return request<ShiftSummary | null>("/shifts/current")
}

export async function openShift(openingFloat: number): Promise<RegisterShift> {
    return request<RegisterShift>("/shifts/open", {
        method: "POST",
        body: JSON.stringify({ opening_float: openingFloat }),
    })
}

export async function closeShift(
    shiftId: number,
    closingCashActual: number,
    notes?: string,
): Promise<ShiftSummary> {
    return request<ShiftSummary>(`/shifts/${shiftId}/close`, {
        method: "POST",
        body: JSON.stringify({
            closing_cash_actual: closingCashActual,
            notes,
        }),
    })
}

export async function getOrderAnalytics(userId?: number | null): Promise<OrderAnalytics> {
    const query = userId !== undefined && userId !== null ? `?user_id=${userId}` : ""
    return request<OrderAnalytics>(`/orders/analytics/summary${query}`)
}

export function getOrderExportCsvUrl(
    userId?: number | null,
    status?: string | null,
): string {
    const params = new URLSearchParams()
    if (userId !== undefined && userId !== null) {
        params.set("user_id", String(userId))
    }
    if (status && status !== "all") {
        params.set("status", status)
    }
    const query = params.toString()
    return `${API_BASE_URL}/orders/export/csv${query ? `?${query}` : ""}`
}

export type Location = {
    id: number
    code: string
    name: string
    address?: string | null
    phone?: string | null
    is_active: boolean
    created_at: string
}

export type Ingredient = {
    id: number
    name: string
    unit: string
    current_stock: number
    reorder_threshold: number
    cost_per_unit: number
    is_active: boolean
    created_at: string
}

export type RecipeItem = {
    id: number
    product_id: number
    ingredient_id: number
    quantity: number
    ingredient_name?: string | null
    ingredient_unit?: string | null
}

export type AuditLogEntry = {
    id: number
    sequence_number: number
    timestamp: string
    event_type: string
    actor_id?: number | null
    actor_email?: string | null
    actor_role?: string | null
    action: string
    resource_type: string
    resource_id?: string | null
    payload?: string | null
    ip_address?: string | null
    previous_hash: string
    record_hash: string
}

export type AuditChainVerification = {
    valid: boolean
    total_records: number
    latest_sequence: number
    chain_head_hash: string
    verified_at: string
    error?: string | null
}

export async function getLocations(): Promise<Location[]> {
    return request<Location[]>("/locations")
}

export async function getIngredients(): Promise<Ingredient[]> {
    return request<Ingredient[]>("/ingredients")
}

export async function updateIngredient(
    id: number,
    data: Partial<Ingredient> & { adjustment_reason?: string },
): Promise<Ingredient> {
    return request<Ingredient>(`/ingredients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
    })
}

export async function getProductRecipe(productId: number): Promise<RecipeItem[]> {
    return request<RecipeItem[]>(`/ingredients/recipes/${productId}`)
}

export async function setProductRecipe(
    productId: number,
    items: Array<{ ingredient_id: number; quantity: number }>,
): Promise<RecipeItem[]> {
    return request<RecipeItem[]>(`/ingredients/recipes/${productId}`, {
        method: "POST",
        body: JSON.stringify(items),
    })
}

export async function getAuditLogs(eventType?: string): Promise<AuditLogEntry[]> {
    const url = eventType ? `/audit-logs?event_type=${encodeURIComponent(eventType)}` : "/audit-logs"
    return request<AuditLogEntry[]>(url)
}

export async function verifyAuditChain(): Promise<AuditChainVerification> {
    return request<AuditChainVerification>("/audit-logs/verify")
}