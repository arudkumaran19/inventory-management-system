// Offline IndexedDB Storage and Queue Engine for Artisan Café POS

const DB_NAME = "ArtisanCafeOfflineDB"
const DB_VERSION = 1
const STORE_PRODUCTS = "cached_products"
const STORE_QUEUE = "offline_order_queue"

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined" || !window.indexedDB) {
            reject(new Error("IndexedDB is not supported in this environment."))
            return
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result
            if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
                db.createObjectStore(STORE_PRODUCTS, { keyPath: "id" })
            }
            if (!db.objectStoreNames.contains(STORE_QUEUE)) {
                db.createObjectStore(STORE_QUEUE, { keyPath: "localId" })
            }
        }

        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export type QueuedOrder = {
    localId: string
    createdAt: string
    items: Array<{ productId: number; name: string; quantity: number; price: number; notes?: string }>
    subtotal: number
    discountPercent: number
    discountReason?: string
    tenderMethod: "cash" | "card"
    amountTendered?: number
    changeDue?: number
    label?: string
}

export async function saveCachedProducts(products: unknown[]): Promise<void> {
    try {
        const db = await openDatabase()
        const tx = db.transaction(STORE_PRODUCTS, "readwrite")
        const store = tx.objectStore(STORE_PRODUCTS)
        store.clear()
        for (const p of products) {
            store.put(p)
        }
    } catch (e) {
        console.warn("Failed to cache products offline:", e)
    }
}

export async function getCachedProducts<T>(): Promise<T[]> {
    try {
        const db = await openDatabase()
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_PRODUCTS, "readonly")
            const store = tx.objectStore(STORE_PRODUCTS)
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result as T[])
            request.onerror = () => resolve([])
        })
    } catch {
        return []
    }
}

export async function queueOfflineOrder(order: Omit<QueuedOrder, "localId" | "createdAt">): Promise<string> {
    const db = await openDatabase()
    const localId = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const queued: QueuedOrder = {
        ...order,
        localId,
        createdAt: new Date().toISOString(),
    }

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, "readwrite")
        const store = tx.objectStore(STORE_QUEUE)
        const request = store.add(queued)
        request.onsuccess = () => resolve(localId)
        request.onerror = () => reject(request.error)
    })
}

export async function getQueuedOrders(): Promise<QueuedOrder[]> {
    try {
        const db = await openDatabase()
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_QUEUE, "readonly")
            const store = tx.objectStore(STORE_QUEUE)
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result as QueuedOrder[])
            request.onerror = () => resolve([])
        })
    } catch {
        return []
    }
}

export async function removeQueuedOrder(localId: string): Promise<void> {
    try {
        const db = await openDatabase()
        const tx = db.transaction(STORE_QUEUE, "readwrite")
        tx.objectStore(STORE_QUEUE).delete(localId)
    } catch (e) {
        console.warn("Failed to delete queued order:", e)
    }
}

