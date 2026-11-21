/**
 * Barcode Data Parser and Metadata Enrichment Engine.
 * Supports:
 *   1. Regional Barcodes across all continents (Asian JAN/EAN, US/Canada UPC, Australian EAN, European EAN)
 *   2. Rich 2D QR Codes / DataMatrix with embedded JSON (e.g. {"name":"...","price":4.50,"qty":12,"category":"..."})
 *   3. Key-Value & Query-string encoded barcodes (e.g. NAME=Oat Milk&PRICE=3.50&QTY=24&CAT=Cold Drinks)
 *   4. Pipe-delimited supplier barcodes (e.g. Vanilla Syrup|12.50|6|Retail|012345678905)
 *   5. Automatic international online product metadata lookup via Open Food Facts API
 */

export interface BarcodeRegion {
    country: string
    region: "Asia" | "North America" | "Australia & Oceania" | "Europe" | "Latin America" | "Middle East & Africa" | "Global"
    flag: string
    prefix: string
    standard: "UPC-A" | "UPC-E" | "EAN-13" | "JAN" | "EAN-8" | "GS1" | "Code-128" | "2D"
}

export interface ParsedBarcodeData {
    barcode: string
    name?: string
    price?: number
    quantity?: number
    category?: "Coffee" | "Cold Drinks" | "Tea" | "Bakery" | "Retail"
    source: "plain" | "qr_json" | "qr_keyvalue" | "delimited" | "open_food_facts"
    region?: BarcodeRegion
}

const CATEGORY_MAP: Record<string, "Coffee" | "Cold Drinks" | "Tea" | "Bakery" | "Retail"> = {
    coffee: "Coffee",
    espresso: "Coffee",
    latte: "Coffee",
    cappuccino: "Coffee",
    beans: "Coffee",
    roast: "Coffee",
    brew: "Coffee",
    drink: "Cold Drinks",
    beverage: "Cold Drinks",
    cola: "Cold Drinks",
    soda: "Cold Drinks",
    water: "Cold Drinks",
    juice: "Cold Drinks",
    milk: "Cold Drinks",
    tea: "Tea",
    matcha: "Tea",
    chai: "Tea",
    sencha: "Tea",
    oolong: "Tea",
    bakery: "Bakery",
    pastry: "Bakery",
    bread: "Bakery",
    cookie: "Bakery",
    biscuit: "Bakery",
    croissant: "Bakery",
    muffin: "Bakery",
    cake: "Bakery",
    snack: "Bakery",
    retail: "Retail",
    syrup: "Retail",
    cup: "Retail",
    mug: "Retail",
    tumbler: "Retail",
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

/**
 * Identifies the GS1 country or global region from numeric barcode prefixes
 * Supports Asian (JAN, China, India, Korea, ASEAN), US/Canada UPC, Australian EAN, European and Latin American codes.
 */
export function getBarcodeRegion(rawBarcode: string): BarcodeRegion {
    const digits = rawBarcode.replace(/\D/g, "")

    // Rich 2D codes or non-numeric
    if (digits.length < 3) {
        return {
            country: "Internal / Custom",
            region: "Global",
            flag: "🏷️",
            prefix: "CUSTOM",
            standard: "Code-128",
        }
    }

    // 12-digit UPC-A (US / Canada standard)
    if (digits.length === 12) {
        return {
            country: "United States / Canada",
            region: "North America",
            flag: "🇺🇸",
            prefix: digits.slice(0, 3),
            standard: "UPC-A",
        }
    }

    // 8-digit codes
    if (digits.length === 8) {
        return {
            country: "Compact Packaging",
            region: "Global",
            flag: "🌐",
            prefix: digits.slice(0, 3),
            standard: "EAN-8",
        }
    }

    const p3 = parseInt(digits.slice(0, 3), 10)

    // US & Canada UPC prefixes (000 - 139)
    if (p3 >= 0 && p3 <= 139) {
        return {
            country: "United States / Canada",
            region: "North America",
            flag: "🇺🇸",
            prefix: digits.slice(0, 3),
            standard: "UPC-A",
        }
    }

    // In-store / Restricted circulation (200 - 299)
    if (p3 >= 200 && p3 <= 299) {
        return {
            country: "In-Store / Café Internal",
            region: "Global",
            flag: "☕",
            prefix: digits.slice(0, 3),
            standard: "GS1",
        }
    }

    // France & Monaco (300 - 379)
    if (p3 >= 300 && p3 <= 379) {
        return {
            country: "France",
            region: "Europe",
            flag: "🇫🇷",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Germany (400 - 440)
    if (p3 >= 400 && p3 <= 440) {
        return {
            country: "Germany",
            region: "Europe",
            flag: "🇩🇪",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Japan JAN (450 - 459 and 490 - 499)
    if ((p3 >= 450 && p3 <= 459) || (p3 >= 490 && p3 <= 499)) {
        return {
            country: "Japan",
            region: "Asia",
            flag: "🇯🇵",
            prefix: digits.slice(0, 3),
            standard: "JAN",
        }
    }

    // Russia (460 - 469)
    if (p3 >= 460 && p3 <= 469) {
        return {
            country: "Russia",
            region: "Europe",
            flag: "🇷🇺",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Taiwan (471)
    if (p3 === 471) {
        return {
            country: "Taiwan",
            region: "Asia",
            flag: "🇹🇼",
            prefix: "471",
            standard: "EAN-13",
        }
    }

    // Sri Lanka (479)
    if (p3 === 479) {
        return {
            country: "Sri Lanka",
            region: "Asia",
            flag: "🇱🇰",
            prefix: "479",
            standard: "EAN-13",
        }
    }

    // Philippines (480)
    if (p3 === 480) {
        return {
            country: "Philippines",
            region: "Asia",
            flag: "🇵🇭",
            prefix: "480",
            standard: "EAN-13",
        }
    }

    // Hong Kong (489)
    if (p3 === 489) {
        return {
            country: "Hong Kong",
            region: "Asia",
            flag: "🇭🇰",
            prefix: "489",
            standard: "EAN-13",
        }
    }

    // United Kingdom (500 - 509)
    if (p3 >= 500 && p3 <= 509) {
        return {
            country: "United Kingdom",
            region: "Europe",
            flag: "🇬🇧",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Ireland (539)
    if (p3 === 539) {
        return {
            country: "Ireland",
            region: "Europe",
            flag: "🇮🇪",
            prefix: "539",
            standard: "EAN-13",
        }
    }

    // Belgium & Luxembourg (540 - 549)
    if (p3 >= 540 && p3 <= 549) {
        return {
            country: "Belgium & Luxembourg",
            region: "Europe",
            flag: "🇧🇪",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Portugal (560)
    if (p3 === 560) {
        return {
            country: "Portugal",
            region: "Europe",
            flag: "🇵🇹",
            prefix: "560",
            standard: "EAN-13",
        }
    }

    // Denmark (570 - 579)
    if (p3 >= 570 && p3 <= 579) {
        return {
            country: "Denmark",
            region: "Europe",
            flag: "🇩🇰",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Poland (590)
    if (p3 === 590) {
        return {
            country: "Poland",
            region: "Europe",
            flag: "🇵🇱",
            prefix: "590",
            standard: "EAN-13",
        }
    }

    // South Africa (600 - 601)
    if (p3 >= 600 && p3 <= 601) {
        return {
            country: "South Africa",
            region: "Middle East & Africa",
            flag: "🇿🇦",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Egypt (622)
    if (p3 === 622) {
        return {
            country: "Egypt",
            region: "Middle East & Africa",
            flag: "🇪🇬",
            prefix: "622",
            standard: "EAN-13",
        }
    }

    // Saudi Arabia (628)
    if (p3 === 628) {
        return {
            country: "Saudi Arabia",
            region: "Middle East & Africa",
            flag: "🇸🇦",
            prefix: "628",
            standard: "EAN-13",
        }
    }

    // United Arab Emirates (629)
    if (p3 === 629) {
        return {
            country: "United Arab Emirates",
            region: "Middle East & Africa",
            flag: "🇦🇪",
            prefix: "629",
            standard: "EAN-13",
        }
    }

    // Finland (640 - 649)
    if (p3 >= 640 && p3 <= 649) {
        return {
            country: "Finland",
            region: "Europe",
            flag: "🇫🇮",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // China (690 - 699)
    if (p3 >= 690 && p3 <= 699) {
        return {
            country: "China",
            region: "Asia",
            flag: "🇨🇳",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Norway (700 - 709)
    if (p3 >= 700 && p3 <= 709) {
        return {
            country: "Norway",
            region: "Europe",
            flag: "🇳🇴",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Israel (729)
    if (p3 === 729) {
        return {
            country: "Israel",
            region: "Middle East & Africa",
            flag: "🇮🇱",
            prefix: "729",
            standard: "EAN-13",
        }
    }

    // Sweden (730 - 739)
    if (p3 >= 730 && p3 <= 739) {
        return {
            country: "Sweden",
            region: "Europe",
            flag: "🇸🇪",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Mexico (750)
    if (p3 === 750) {
        return {
            country: "Mexico",
            region: "Latin America",
            flag: "🇲🇽",
            prefix: "750",
            standard: "EAN-13",
        }
    }

    // Switzerland & Liechtenstein (760 - 769)
    if (p3 >= 760 && p3 <= 769) {
        return {
            country: "Switzerland",
            region: "Europe",
            flag: "🇨🇭",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Colombia (770 - 771)
    if (p3 >= 770 && p3 <= 771) {
        return {
            country: "Colombia",
            region: "Latin America",
            flag: "🇨🇴",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Argentina (778 - 779)
    if (p3 >= 778 && p3 <= 779) {
        return {
            country: "Argentina",
            region: "Latin America",
            flag: "🇦🇷",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Chile (780)
    if (p3 === 780) {
        return {
            country: "Chile",
            region: "Latin America",
            flag: "🇨🇱",
            prefix: "780",
            standard: "EAN-13",
        }
    }

    // Brazil (789 - 790)
    if (p3 >= 789 && p3 <= 790) {
        return {
            country: "Brazil",
            region: "Latin America",
            flag: "🇧🇷",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Italy (800 - 839)
    if (p3 >= 800 && p3 <= 839) {
        return {
            country: "Italy",
            region: "Europe",
            flag: "🇮🇹",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Spain (840 - 849)
    if (p3 >= 840 && p3 <= 849) {
        return {
            country: "Spain",
            region: "Europe",
            flag: "🇪🇸",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Turkey (868 - 869)
    if (p3 >= 868 && p3 <= 869) {
        return {
            country: "Turkey",
            region: "Europe",
            flag: "🇹🇷",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Netherlands (870 - 879)
    if (p3 >= 870 && p3 <= 879) {
        return {
            country: "Netherlands",
            region: "Europe",
            flag: "🇳🇱",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // South Korea (880)
    if (p3 === 880) {
        return {
            country: "South Korea",
            region: "Asia",
            flag: "🇰🇷",
            prefix: "880",
            standard: "EAN-13",
        }
    }

    // Thailand (885)
    if (p3 === 885) {
        return {
            country: "Thailand",
            region: "Asia",
            flag: "🇹🇭",
            prefix: "885",
            standard: "EAN-13",
        }
    }

    // Singapore (888)
    if (p3 === 888) {
        return {
            country: "Singapore",
            region: "Asia",
            flag: "🇸🇬",
            prefix: "888",
            standard: "EAN-13",
        }
    }

    // India (890)
    if (p3 === 890) {
        return {
            country: "India",
            region: "Asia",
            flag: "🇮🇳",
            prefix: "890",
            standard: "EAN-13",
        }
    }

    // Vietnam (893)
    if (p3 === 893) {
        return {
            country: "Vietnam",
            region: "Asia",
            flag: "🇻🇳",
            prefix: "893",
            standard: "EAN-13",
        }
    }

    // Pakistan (896)
    if (p3 === 896) {
        return {
            country: "Pakistan",
            region: "Asia",
            flag: "🇵🇰",
            prefix: "896",
            standard: "EAN-13",
        }
    }

    // Indonesia (899)
    if (p3 === 899) {
        return {
            country: "Indonesia",
            region: "Asia",
            flag: "🇮🇩",
            prefix: "899",
            standard: "EAN-13",
        }
    }

    // Austria (900 - 919)
    if (p3 >= 900 && p3 <= 919) {
        return {
            country: "Austria",
            region: "Europe",
            flag: "🇦🇹",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Australia (930 - 939)
    if (p3 >= 930 && p3 <= 939) {
        return {
            country: "Australia",
            region: "Australia & Oceania",
            flag: "🇦🇺",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // New Zealand (940 - 949)
    if (p3 >= 940 && p3 <= 949) {
        return {
            country: "New Zealand",
            region: "Australia & Oceania",
            flag: "🇳🇿",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Malaysia (955)
    if (p3 === 955) {
        return {
            country: "Malaysia",
            region: "Asia",
            flag: "🇲🇾",
            prefix: "955",
            standard: "EAN-13",
        }
    }

    // Books / ISBN (978 - 979)
    if (p3 >= 978 && p3 <= 979) {
        return {
            country: "Bookland (ISBN)",
            region: "Global",
            flag: "📚",
            prefix: digits.slice(0, 3),
            standard: "EAN-13",
        }
    }

    // Fallback based on 2-digit range or default GS1
    return {
        country: "International (GS1)",
        region: "Global",
        flag: "🌐",
        prefix: digits.slice(0, Math.min(3, digits.length)),
        standard: "GS1",
    }
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
                const finalBarcode = barcode || ("QR-" + Math.abs(hashCode(trimmed)))
                return {
                    barcode: finalBarcode,
                    name,
                    price: price && !isNaN(price) && price > 0 ? price : undefined,
                    quantity: quantity && !isNaN(quantity) && quantity >= 0 ? Math.floor(quantity) : undefined,
                    category: rawCat ? inferCategory(rawCat) : name ? inferCategory(name) : undefined,
                    source: "qr_json",
                    region: {
                        country: "2D QR Matrix",
                        region: "Global",
                        flag: "📱",
                        prefix: "QR",
                        standard: "2D",
                    },
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
            const finalBarcode = barcode || ("KV-" + Math.abs(hashCode(trimmed)))

            return {
                barcode: finalBarcode,
                name,
                price: price && !isNaN(price) && price > 0 ? price : undefined,
                quantity: qty && !isNaN(qty) && qty >= 0 ? qty : undefined,
                category: catStr ? inferCategory(catStr) : name ? inferCategory(name) : undefined,
                source: "qr_keyvalue",
                region: {
                    country: "Key-Value Barcode",
                    region: "Global",
                    flag: "🏷️",
                    prefix: "KV",
                    standard: "2D",
                },
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
                region: {
                    country: "Supplier Catalog Code",
                    region: "Global",
                    flag: "📦",
                    prefix: "DELIM",
                    standard: "Code-128",
                },
            }
        }
    }

    return null
}

/**
 * Attempt to lookup product metadata by barcode online across global databases (via Open Food Facts API).
 * Times out gracefully after 2200ms if offline or unavailable.
 * Inspects English, regional, and multilingual product attributes (US, Asia, Australia, Europe).
 */
export async function lookupBarcodeOnline(barcode: string): Promise<ParsedBarcodeData | null> {
    const cleanDigits = barcode.replace(/\s+/g, "")
    // Query standard 8-to-14 digit global barcodes
    if (!/^\d{8,14}$/.test(cleanDigits)) {
        return null
    }

    const region = getBarcodeRegion(cleanDigits)

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
                product_name_en?: string
                product_name_ja?: string
                product_name_zh?: string
                product_name_ko?: string
                product_name_hi?: string
                generic_name?: string
                generic_name_en?: string
                categories?: string
                brands?: string
            }
        }

        if (data.status === 1 && data.product) {
            const p = data.product
            // Check multilingual product name variations
            const rawName =
                p.product_name?.trim() ||
                p.product_name_en?.trim() ||
                p.product_name_ja?.trim() ||
                p.product_name_zh?.trim() ||
                p.product_name_ko?.trim() ||
                p.product_name_hi?.trim() ||
                p.generic_name?.trim() ||
                p.generic_name_en?.trim() ||
                (p.brands ? `${p.brands.trim()} Item` : "")

            const categoryText = (p.categories || "") + " " + (rawName || "")
            if (rawName) {
                // Prepend brand for cleaner identification if brand is not already in name
                const brand = p.brands?.trim()
                const formattedName =
                    brand && !rawName.toLowerCase().includes(brand.toLowerCase())
                        ? `${brand} - ${rawName}`
                        : rawName

                return {
                    barcode: cleanDigits,
                    name: formattedName,
                    category: inferCategory(categoryText),
                    source: "open_food_facts",
                    region,
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
 * 2. Normalizes digits and identifies GS1 country and regional standard (US, Asian, Australian, EU).
 * 3. Checks online international metadata databases if consumer barcode.
 * 4. Returns canonical barcode with region metadata attached.
 */
export async function resolveBarcodeData(rawText: string): Promise<ParsedBarcodeData> {
    // 1. Try rich format first
    const rich = parseRichBarcode(rawText)
    if (rich) return rich

    // 2. Normalization
    const cleaned = rawText.trim()
    const noSpaces = cleaned.replace(/\s+/g, "")
    const canonicalBarcode = /^\d+$/.test(noSpaces) && noSpaces.length >= 3 ? noSpaces : cleaned
    const region = getBarcodeRegion(canonicalBarcode)

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
        region,
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
