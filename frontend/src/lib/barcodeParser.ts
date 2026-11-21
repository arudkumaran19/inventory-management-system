/**
 * Barcode Data Parser and Metadata Enrichment Engine.
 * Supports:
 *   1. Plain Barcodes (EAN-13, UPC-A, Code 128, Code 39)
 *   2. Rich 2D QR Codes / DataMatrix with embedded JSON (e.g. {"name":"...","price":4.50,"qty":12,"category":"..."})
 *   3. Key-Value & Query-string encoded barcodes (e.g. NAME=Oat Milk&PRICE=3.50&QTY=24&CAT=Cold Drinks)
 *   4. Pipe-delimited supplier barcodes (e.g. Vanilla Syrup|12.50|6|Retail|012345678905)
 *   5. Automatic online product metadata lookup via Open Food Facts API
 */

export interface ParsedBarcodeData {
    barcode: string
    name?: string
    price?: number
    quantity?: number
    category?: "Coffee" | "Cold Drinks" | "Tea" | "Bakery" | "Retail"
    source: "plain" | "qr_json" | "qr_keyvalue" | "delimited" | "open_food_facts"
}

const CATEGORY_MAP: Record<string, "Coffee" | "Cold Drinks" | "Tea" | "Bakery" | "Retail"> = {
    coffee: "Coffee",
    espresso: "Coffee",
    latte: "Coffee",
    cappuccino: "Coffee",
    beans: "Coffee",
    drink: "Cold Drinks",
    beverage: "Cold Drinks",
    cola: "Cold Drinks",
    soda: "Cold Drinks",
    water: "Cold Drinks",
    juice: "Cold Drinks",
    tea: "Tea",
    matcha: "Tea",
    chai: "Tea",
    bakery: "Bakery",
    pastry: "Bakery",
    bread: "Bakery",
    cookie: "Bakery",
    croissant: "Bakery",
    muffin: "Bakery",
    retail: "Retail",
    syrup: "Retail",
    cup: "Retail",
    mug: "Retail",
}

function inferCategory(text: string): "Coffee" | "Cold Drinks" | "Tea" | "Bakery" | "Retail" {
    const lower = text.toLowerCase()
    for (const [kw, cat] of Object.entries(CATEGORY_MAP)) {
        if (lower.includes(kw)) {
            return cat
        }
    }
    return "Coffee"
}

export function parseRichBarcode(rawText: string): ParsedBarcodeData | null {
    const trimmed = rawText.trim()
    if (!trimmed) return null

    // 1. Try parsing as JSON (common in advanced QR/DataMatrix inventory labels)
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            const data = JSON.parse(trimmed) as Record<string, unknown>
            const barcode = String(data.barcode || data.sku || data.id || "").trim()
            const name = typeof data.name === "string" ? data.name.trim() : undefined
            const price = typeof data.price === "number" ? data.price : typeof data.price === "string" ? parseFloat(data.price) : undefined
            const quantity = typeof data.qty === "number" ? data.qty : typeof data.stock === "number" ? data.stock : typeof data.quantity === "number" ? data.quantity : undefined
            const rawCat = typeof data.category === "string" ? data.category : typeof data.cat === "string" ? data.cat : undefined

            if (name || barcode) {
                return {
                    barcode: barcode || ("QR-" + Math.abs(hashCode(trimmed))),
                    name,
                    price: price && !isNaN(price) && price > 0 ? price : undefined,
                    quantity: quantity && !isNaN(quantity) && quantity >= 0 ? Math.floor(quantity) : undefined,
                    category: rawCat ? inferCategory(rawCat) : name ? inferCategory(name) : undefined,
                    source: "qr_json",
                }
            }
        } catch {
            // Not valid JSON
        }
    }

    // 2. Try parsing Key-Value string (e.g. NAME=Oat Milk&PRICE=3.50&QTY=24&CAT=Cold Drinks)
    if (trimmed.includes("=") && (trimmed.includes("&") || trimmed.includes(";"))) {
        const parts = trimmed.split(/[&;]/)
        const map = new Map<string, string>()
        for (const part of parts) {
            const [k, v] = part.split("=")
            if (k && v) {
                map.set(k.trim().toUpperCase(), decodeURIComponent(v.trim()))
            }
        }

        const name = map.get("NAME") || map.get("PRODUCT") || map.get("TITLE")
        const priceStr = map.get("PRICE") || map.get("COST")
        const qtyStr = map.get("QTY") || map.get("QUANTITY") || map.get("STOCK")
        const catStr = map.get("CAT") || map.get("CATEGORY")
        const barcode = map.get("BARCODE") || map.get("SKU") || map.get("CODE")

        if (name || barcode) {
            const price = priceStr ? parseFloat(priceStr) : undefined
            const qty = qtyStr ? parseInt(qtyStr, 10) : undefined

            return {
                barcode: barcode || ("KV-" + Math.abs(hashCode(trimmed))),
                name,
                price: price && !isNaN(price) && price > 0 ? price : undefined,
                quantity: qty && !isNaN(qty) && qty >= 0 ? qty : undefined,
                category: catStr ? inferCategory(catStr) : name ? inferCategory(name) : undefined,
                source: "qr_keyvalue",
            }
        }
    }

    // 3. Try parsing Pipe-delimited (e.g. Name|Price|Qty|Category|Barcode)
    if (trimmed.includes("|")) {
        const segments = trimmed.split("|").map((s) => s.trim())
        if (segments.length >= 2) {
            const name = segments[0]
            const price = parseFloat(segments[1])
            const qty = segments.length >= 3 ? parseInt(segments[2], 10) : undefined
            const cat = segments.length >= 4 ? inferCategory(segments[3]) : inferCategory(name)
            const barcode = segments.length >= 5 ? segments[4] : ("DELIM-" + Math.abs(hashCode(trimmed)))

            return {
                barcode,
                name,
                price: !isNaN(price) && price > 0 ? price : undefined,
                quantity: qty !== undefined && !isNaN(qty) && qty >= 0 ? qty : undefined,
                category: cat,
                source: "delimited",
            }
        }
    }

    return null
}

/**
 * Attempt to lookup product metadata by barcode online (via Open Food Facts API).
 * Times out gracefully after 2200ms if offline or unavailable.
 */
export async function lookupBarcodeOnline(barcode: string): Promise<ParsedBarcodeData | null> {
    const cleanDigits = barcode.replace(/\s+/g, "")
    // Only query standard EAN/UPC digit codes
    if (!/^\d{8,14}$/.test(cleanDigits)) {
        return null
    }

    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 2200)

        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${cleanDigits}.json`, {
            signal: controller.signal,
            headers: {
                Accept: "application/json",
            },
        })
        clearTimeout(timeoutId)

        if (!res.ok) return null
        const data = await res.json() as {
            status: number
            product?: {
                product_name?: string
                generic_name?: string
                categories?: string
            }
        }

        if (data.status === 1 && data.product) {
            const name = data.product.product_name?.trim() || data.product.generic_name?.trim()
            const categoryText = (data.product.categories || "") + " " + (name || "")
            if (name) {
                return {
                    barcode: cleanDigits,
                    name,
                    category: inferCategory(categoryText),
                    source: "open_food_facts",
                }
            }
        }
    } catch {
        // Offline or request timed out
    }

    return null
}

/**
 * Resolves any scanned string into structured barcode data:
 * 1. Checks for rich encoded data (JSON, Key-Value, Delimited).
 * 2. Normalizes digits and checks online databases if EAN/UPC.
 * 3. Falls back to clean plain barcode string.
 */
export async function resolveBarcodeData(rawText: string): Promise<ParsedBarcodeData> {
    // 1. Try rich format first
    const rich = parseRichBarcode(rawText)
    if (rich) return rich

    // 2. Normalization
    const cleaned = rawText.trim()
    const noSpaces = cleaned.replace(/\s+/g, "")
    const canonicalBarcode = /^\d+$/.test(noSpaces) && noSpaces.length >= 3 ? noSpaces : cleaned

    // 3. Online metadata lookup for consumer barcodes
    if (/^\d{8,14}$/.test(canonicalBarcode)) {
        const online = await lookupBarcodeOnline(canonicalBarcode)
        if (online) {
            return online
        }
    }

    return {
        barcode: canonicalBarcode,
        source: "plain",
    }
}

function hashCode(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i)
        hash |= 0
    }
    return hash
}

