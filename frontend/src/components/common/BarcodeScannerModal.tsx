import { useEffect, useRef, useState, useCallback } from "react"
import {
    Barcode,
    CameraOff,
    CheckCircle2,
    FlipHorizontal,
    Globe,
    Keyboard,
    X,
    Zap,
} from "lucide-react"
import {
    MultiFormatReader,
    HTMLCanvasElementLuminanceSource,
    HybridBinarizer,
    BinaryBitmap,
    BarcodeFormat,
    DecodeHintType,
} from "@zxing/library"
import { playScanSound } from "../../lib/sound"
import { getBarcodeRegion } from "../../lib/barcodeParser"

type BarcodeScannerModalProps = {
    isOpen: boolean
    onClose: () => void
    onScan: (barcode: string) => void
    title?: string
    subtitle?: string
    allowRapidRestock?: boolean
    onQuickRestock?: (
        barcode: string,
        quantity: number,
    ) => Promise<{
        success: boolean
        productName?: string
        newStock?: number
        message?: string
    }>
}

// Global multi-region barcode formats supported across all continents
const zxingHints = new Map<DecodeHintType, unknown>()
zxingHints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13, // Global / Asia (JAN, China, India) / Australia / Europe
    BarcodeFormat.UPC_A,  // United States & Canada standard
    BarcodeFormat.CODE_128, // Global logistics / GS1-128 shipping
    BarcodeFormat.CODE_39,  // Industrial / retail inventory
    BarcodeFormat.CODE_93,  // High-density alphanumeric
    BarcodeFormat.QR_CODE,  // Global 2D / Japan Denso Wave
    BarcodeFormat.EAN_8,    // European / Asian compact retail
    BarcodeFormat.UPC_E,    // US zero-suppressed packaging
    BarcodeFormat.DATA_MATRIX, // Small packaging / medicine / global
    BarcodeFormat.ITF,      // Interleaved 2 of 5 / GTIN-14 cartons
    BarcodeFormat.CODABAR,  // Global logistics / libraries
    BarcodeFormat.AZTEC,    // Transport / ticketing
    BarcodeFormat.PDF_417,  // Logistics & ID documents
])
zxingHints.set(DecodeHintType.TRY_HARDER, true)

// Native browser hardware barcode detector interface (Chrome / Edge / Android)
interface NativeBarcodeResult {
    rawValue?: string
    rawText?: string
}

interface NativeBarcodeDetectorInstance {
    detect: (source: CanvasImageSource) => Promise<NativeBarcodeResult[]>
}

export function BarcodeScannerModal({
    isOpen,
    onClose,
    onScan,
    title = "Scan Product Barcode",
    subtitle = "Position the barcode within the camera viewfinder or enter manually.",
    allowRapidRestock = false,
    onQuickRestock,
}: BarcodeScannerModalProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [cameraError, setCameraError] = useState<string | null>(null)
    const [manualBarcode, setManualBarcode] = useState("")
    const [scannedCode, setScannedCode] = useState<string | null>(null)
    const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
    const [hasTorch, setHasTorch] = useState(false)
    const [torchOn, setTorchOn] = useState(false)
    const [scanMode, setScanMode] = useState<"lookup" | "restock">("lookup")
    const [packSize, setPackSize] = useState<number>(1)
    const [restockStatus, setRestockStatus] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)
    const [targetState, setTargetState] = useState<"idle" | "aligning" | "locked">("idle")
    const scanLockRef = useRef(false)

    // Start camera stream
    useEffect(() => {
        if (!isOpen) {
            return
        }

        let isMounted = true
        let localStream: MediaStream | null = null

        async function initCamera() {
            setCameraError(null)
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("Camera API is not supported on this browser or connection.")
                }

                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: facingMode },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                })

                if (!isMounted) {
                    newStream.getTracks().forEach((t) => t.stop())
                    return
                }

                localStream = newStream
                setStream(newStream)

                if (videoRef.current) {
                    videoRef.current.srcObject = newStream
                    await videoRef.current.play()
                }

                // Check for torch capability and enable continuous autofocus if supported
                const track = newStream.getVideoTracks()[0]
                const capabilities = track.getCapabilities?.() as {
                    torch?: boolean
                    focusMode?: string[]
                } | undefined
                setHasTorch(Boolean(capabilities?.torch))

                if (capabilities?.focusMode?.includes("continuous")) {
                    try {
                        await track.applyConstraints({
                            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
                        })
                    } catch {
                        // ignore autofocus error
                    }
                }
            } catch (err) {
                if (isMounted) {
                    const msg =
                        err instanceof Error
                            ? err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
                                ? "Camera permission was denied. Please allow camera access in browser settings or enter the barcode manually below."
                                : err.message
                            : "Unable to access camera."
                    setCameraError(msg)
                }
            }
        }

        void initCamera()

        return () => {
            isMounted = false
            if (localStream) {
                localStream.getTracks().forEach((track) => track.stop())
            }
            setStream(null)
            setScannedCode(null)
            setManualBarcode("")
            scanLockRef.current = false
        }
    }, [isOpen, facingMode])

    const handleProcessCode = useCallback(
        async (raw: string) => {
            if (scanLockRef.current) return
            scanLockRef.current = true
            setScannedCode(raw)

            if (allowRapidRestock && onQuickRestock && scanMode === "restock") {
                try {
                    const res = await onQuickRestock(raw, packSize)
                    if (res.success) {
                        playScanSound("success")
                        setRestockStatus({
                            type: "success",
                            text: `+${packSize} ${res.productName || raw} (Stock: ${res.newStock ?? "?"})`,
                        })
                    } else {
                        playScanSound("error")
                        setRestockStatus({
                            type: "error",
                            text: res.message || "Product not found. Switch to Add mode.",
                        })
                    }
                } catch {
                    playScanSound("error")
                    setRestockStatus({ type: "error", text: "Restock error." })
                } finally {
                    setTimeout(() => {
                        setScannedCode(null)
                        setRestockStatus(null)
                        setTargetState("idle")
                        scanLockRef.current = false
                    }, 1400)
                }
            } else {
                playScanSound("success")
                setTimeout(() => {
                    onScan(raw)
                    onClose()
                }, 220)
            }
        },
        [allowRapidRestock, onQuickRestock, scanMode, packSize, onScan, onClose],
    )

    // Ultra-responsive real-time barcode decoding using offscreen canvas ROI cropping
    // Powered by native BarcodeDetector (GPU hardware-accelerated) + ZXing MultiFormatReader
    // Video stream is NEVER touched or stopped by ZXing, eliminating camera blackouts!
    useEffect(() => {
        if (!isOpen || !stream || cameraError) {
            return
        }

        const video = videoRef.current
        if (!video) return

        let isRunning = true
        let isDecoding = false

        // Instantiate native hardware-accelerated BarcodeDetector if available
        let nativeDetector: NativeBarcodeDetectorInstance | null = null
        if (typeof window !== "undefined" && "BarcodeDetector" in window) {
            try {
                const BD = (window as unknown as {
                    BarcodeDetector: new (opts?: { formats?: string[] }) => NativeBarcodeDetectorInstance
                }).BarcodeDetector
                nativeDetector = new BD({
                    formats: [
                        "ean_13",
                        "ean_8",
                        "upc_a",
                        "upc_e",
                        "code_128",
                        "code_39",
                        "code_93",
                        "itf",
                        "codabar",
                        "qr_code",
                        "data_matrix",
                        "aztec",
                        "pdf417",
                    ],
                })
            } catch {
                nativeDetector = null
            }
        }

        const zxingReader = new MultiFormatReader()
        zxingReader.setHints(zxingHints)

        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d", { willReadFrequently: true })

        // High-frequency 60ms interval for near-instantaneous capture (< 80ms latency)
        const intervalId = setInterval(async () => {
            if (!isRunning || scanLockRef.current || isDecoding || !video || video.readyState < 2) {
                return
            }

            const vw = video.videoWidth
            const vh = video.videoHeight
            if (vw === 0 || vh === 0 || !ctx) return

            isDecoding = true

            // Crop strictly to the marked center target box (center 65% width, center 45% height)
            const cropW = Math.floor(vw * 0.65)
            const cropH = Math.floor(vh * 0.45)
            const cropX = Math.floor((vw - cropW) / 2)
            const cropY = Math.floor((vh - cropH) / 2)

            canvas.width = cropW
            canvas.height = cropH

            // Draw ONLY the viewfinder area to the canvas. Anything outside the box is omitted!
            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

            let detectedCode: string | null = null

            // 1. Try hardware-accelerated native BarcodeDetector first
            if (nativeDetector) {
                try {
                    const results = await nativeDetector.detect(canvas)
                    if (results && results.length > 0) {
                        const raw = (results[0].rawValue || results[0].rawText || "").trim()
                        if (raw) {
                            detectedCode = raw
                        }
                    }
                } catch {
                    // Fall back to ZXing below
                }
            }

            // 2. If not detected by native engine, use ZXing MultiFormatReader
            if (!detectedCode) {
                try {
                    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas)
                    const binarizer = new HybridBinarizer(luminanceSource)
                    const bitmap = new BinaryBitmap(binarizer)
                    const zxingResult = zxingReader.decode(bitmap)
                    if (zxingResult) {
                        const raw = zxingResult.getText().trim()
                        if (raw) {
                            detectedCode = raw
                        }
                    }
                } catch {
                    // No barcode in this cropped frame
                } finally {
                    zxingReader.reset()
                }
            }

            // Instantaneous Capture: Since the canvas contains ONLY the marked viewfinder box,
            // any detected code is guaranteed to be inside the marked area! Capture immediately!
            if (detectedCode && isRunning && !scanLockRef.current) {
                setTargetState("locked")
                void handleProcessCode(detectedCode)
            } else if (!scanLockRef.current) {
                setTargetState("idle")
            }

            isDecoding = false
        }, 60)

        return () => {
            isRunning = false
            clearInterval(intervalId)
            setTargetState("idle")
        }
    }, [isOpen, stream, cameraError, handleProcessCode])

    const toggleTorch = async () => {
        if (!stream) return
        const track = stream.getVideoTracks()[0]
        try {
            await track.applyConstraints({
                advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
            })
            setTorchOn(!torchOn)
        } catch {
            // Torch toggle failed
        }
    }

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const code = manualBarcode.trim()
        if (!code) return
        setManualBarcode("")
        void handleProcessCode(code)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="relative w-full max-w-md rounded-2xl bg-[#FAF8F5] border border-[#E8E3DB] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#E8E3DB] bg-white px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                            <Barcode className="size-4.5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="font-serif-brand text-base font-bold text-[#1C1917]">
                                    {title}
                                </h2>
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    <Globe className="size-2.5 text-emerald-600" />
                                    Global / All Regions
                                </span>
                            </div>
                            <p className="text-[11px] text-[#78716C]">
                                {subtitle}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-1.5 text-[#A8A29E] hover:bg-[#FAF8F5] hover:text-[#1C1917] transition cursor-pointer"
                        aria-label="Close scanner"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Mode Selector for Rapid Restock */}
                {allowRapidRestock && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E3DB] bg-[#FAF8F5] px-4 py-2.5">
                        <div className="flex rounded-lg border border-[#E8E3DB] bg-white p-0.5 shadow-2xs">
                            <button
                                type="button"
                                onClick={() => {
                                    setScanMode("lookup")
                                    setRestockStatus(null)
                                }}
                                className={[
                                    "px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                                    scanMode === "lookup"
                                        ? "bg-[#78350F] text-white"
                                        : "text-[#78716C] hover:text-[#1C1917]",
                                ].join(" ")}
                            >
                                Identify &amp; Add
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setScanMode("restock")
                                    setRestockStatus(null)
                                }}
                                className={[
                                    "flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer",
                                    scanMode === "restock"
                                        ? "bg-[#215A36] text-white"
                                        : "text-[#78716C] hover:text-[#1C1917]",
                                ].join(" ")}
                            >
                                <Zap className="size-3 text-amber-300" />
                                ⚡ Rapid Restock
                            </button>
                        </div>

                        {scanMode === "restock" && (
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-[#78716C] uppercase">Pack:</span>
                                {[1, 6, 12, 24].map((size) => (
                                    <button
                                        key={size}
                                        type="button"
                                        onClick={() => setPackSize(size)}
                                        className={[
                                            "px-2 py-0.5 text-[11px] font-bold rounded-md border transition-all cursor-pointer",
                                            packSize === size
                                                ? "bg-[#215A36] text-white border-[#215A36] shadow-2xs"
                                                : "bg-white text-[#1C1917] border-[#E8E3DB] hover:bg-[#FAF8F5]",
                                        ].join(" ")}
                                    >
                                        +{size}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Camera Viewport */}
                <div className="relative aspect-4/3 w-full bg-stone-900 overflow-hidden flex items-center justify-center">
                    {cameraError ? (
                        <div className="p-6 text-center text-stone-300 space-y-2">
                            <CameraOff className="mx-auto size-10 text-stone-400" />
                            <p className="text-xs font-semibold text-rose-300">
                                {cameraError}
                            </p>
                            <p className="text-[11px] text-stone-400">
                                You can scan directly with a physical USB/Bluetooth scanner or enter the code below.
                            </p>
                        </div>
                    ) : (
                        <>
                            <video
                                ref={videoRef}
                                playsInline
                                muted
                                className="h-full w-full object-cover"
                            />

                            {/* Viewfinder Target Reticle */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
                                <div
                                    className={[
                                        "relative w-64 h-36 rounded-xl border-2 transition-all duration-100",
                                        targetState === "locked"
                                            ? "border-emerald-400 bg-emerald-500/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.55),0_0_24px_rgba(52,211,153,0.7)] scale-102"
                                            : "border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]",
                                    ].join(" ")}
                                >
                                    {/* Corner accents */}
                                    <div
                                        className={[
                                            "absolute -top-1 -left-1 size-4 border-t-3 border-l-3 transition-colors",
                                            targetState === "locked" ? "border-emerald-400" : "border-amber-400",
                                        ].join(" ")}
                                    />
                                    <div
                                        className={[
                                            "absolute -top-1 -right-1 size-4 border-t-3 border-r-3 transition-colors",
                                            targetState === "locked" ? "border-emerald-400" : "border-amber-400",
                                        ].join(" ")}
                                    />
                                    <div
                                        className={[
                                            "absolute -bottom-1 -left-1 size-4 border-b-3 border-l-3 transition-colors",
                                            targetState === "locked" ? "border-emerald-400" : "border-amber-400",
                                        ].join(" ")}
                                    />
                                    <div
                                        className={[
                                            "absolute -bottom-1 -right-1 size-4 border-b-3 border-r-3 transition-colors",
                                            targetState === "locked" ? "border-emerald-400" : "border-amber-400",
                                        ].join(" ")}
                                    />

                                    {/* Scanning line animation */}
                                    <div
                                        className={[
                                            "w-full h-0.5 absolute top-1/2 -translate-y-1/2 transition-colors",
                                            targetState === "locked"
                                                ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,1)]"
                                                : "bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse",
                                        ].join(" ")}
                                    />
                                </div>

                                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
                                    <p
                                        className={[
                                            "text-[10px] font-semibold px-3 py-0.5 rounded-full whitespace-nowrap shadow-sm backdrop-blur-xs transition-all",
                                            targetState === "locked"
                                                ? "bg-emerald-500 text-white"
                                                : "bg-black/60 text-white/90",
                                        ].join(" ")}
                                    >
                                        {targetState === "locked"
                                            ? "Barcode Captured!"
                                            : "Position barcode inside marked box"}
                                    </p>
                                    <span className="text-[9px] text-white/70 font-medium">
                                        Asian (JAN/CN/IN) • US (UPC) • AU/NZ • EU • 1D/2D
                                    </span>
                                </div>
                            </div>

                            {/* Camera controls overlay */}
                            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
                                {hasTorch && (
                                    <button
                                        type="button"
                                        onClick={() => void toggleTorch()}
                                        className={[
                                            "size-8 rounded-full flex items-center justify-center backdrop-blur-md transition cursor-pointer text-xs",
                                            torchOn
                                                ? "bg-amber-400 text-stone-900"
                                                : "bg-black/40 text-white hover:bg-black/60",
                                        ].join(" ")}
                                        title="Toggle Flash"
                                    >
                                        <Zap className="size-4" />
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))}
                                    className="size-8 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center backdrop-blur-md transition cursor-pointer"
                                    title="Switch Camera"
                                >
                                    <FlipHorizontal className="size-4" />
                                </button>
                            </div>

                            {/* Restock or Success Overlay Banner */}
                            {restockStatus ? (
                                <div
                                    className={[
                                        "absolute inset-0 flex flex-col items-center justify-center text-white p-5 animate-in fade-in duration-100 z-20 text-center",
                                        restockStatus.type === "success"
                                            ? "bg-[#215A36]/95"
                                            : "bg-rose-900/95",
                                    ].join(" ")}
                                >
                                    {restockStatus.type === "success" ? (
                                        <>
                                            <CheckCircle2 className="size-12 text-[#A7F3D0] animate-bounce" />
                                            <p className="mt-2 text-base font-bold tracking-tight">
                                                Stock Received!
                                            </p>
                                            <p className="font-mono text-sm font-semibold bg-black/30 px-3 py-1.5 rounded-xl mt-1 text-[#A7F3D0] max-w-xs break-words">
                                                {restockStatus.text}
                                            </p>
                                            <p className="mt-3 text-[11px] text-white/80 font-medium animate-pulse">
                                                Ready for next scan...
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <X className="size-12 text-rose-300" />
                                            <p className="mt-2 text-base font-bold tracking-tight text-white">
                                                Item Not Found
                                            </p>
                                            <p className="text-xs text-rose-200 mt-1 max-w-xs">
                                                {restockStatus.text}
                                            </p>
                                        </>
                                    )}
                                </div>
                            ) : scannedCode ? (
                                <div className="absolute inset-0 bg-[#215A36]/95 flex flex-col items-center justify-center text-white p-4 animate-in fade-in duration-100 z-20">
                                    <CheckCircle2 className="size-12 text-[#A7F3D0] animate-bounce" />
                                    <p className="mt-2 text-sm font-bold tracking-tight">
                                        Barcode Captured!
                                    </p>
                                    <p className="font-mono text-base font-extrabold bg-black/25 px-3 py-1 rounded-lg mt-1 tracking-wider">
                                        {scannedCode}
                                    </p>
                                    {(() => {
                                        const reg = getBarcodeRegion(scannedCode)
                                        return (
                                            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/20 text-white backdrop-blur-xs">
                                                <span className="text-base">{reg.flag}</span>
                                                <span>{reg.country}</span>
                                                <span className="text-[10px] text-emerald-200 uppercase font-mono">({reg.standard})</span>
                                            </div>
                                        )
                                    })()}
                                </div>
                            ) : null}
                        </>
                    )}
                </div>

                {/* Manual Barcode / USB Scanner Input */}
                <div className="p-4 bg-white border-t border-[#E8E3DB]">
                    <form onSubmit={handleManualSubmit} className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label
                                htmlFor="manual-barcode-input"
                                className="text-[11px] font-bold text-[#78716C] uppercase tracking-wider flex items-center gap-1.5"
                            >
                                <Keyboard className="size-3.5 text-[#78350F]" />
                                Manual / USB Scanner Input
                            </label>
                            <span className="text-[10px] text-[#A8A29E] font-medium">
                                USB scanners type here automatically
                            </span>
                        </div>

                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Barcode className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#A8A29E]" />
                                <input
                                    id="manual-barcode-input"
                                    type="text"
                                    value={manualBarcode}
                                    onChange={(e) => setManualBarcode(e.target.value)}
                                    placeholder="e.g. 012345678905 or JAN/EAN/SKU..."
                                    autoFocus
                                    className="w-full h-10 rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 pl-9 pr-3 text-xs font-mono font-semibold text-[#1C1917] outline-none transition placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:ring-2 focus:ring-[#78350F]/15"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={!manualBarcode.trim()}
                                className="h-10 px-4 rounded-xl bg-[#78350F] text-xs font-bold text-white shadow-2xs hover:bg-[#5C2B09] active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                            >
                                Submit Code
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
