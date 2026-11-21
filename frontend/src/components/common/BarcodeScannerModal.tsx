import { useEffect, useRef, useState, useCallback } from "react"
import {
    Barcode,
    CameraOff,
    CheckCircle2,
    FlipHorizontal,
    Keyboard,
    X,
    Zap,
} from "lucide-react"
import {
    BrowserMultiFormatReader,
    BarcodeFormat,
    DecodeHintType,
} from "@zxing/library"
import { playScanSound } from "../../lib/sound"

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

const zxingHints = new Map<DecodeHintType, unknown>()
zxingHints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.UPC_A,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_E,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
])
zxingHints.set(DecodeHintType.TRY_HARDER, true)

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
                        scanLockRef.current = false
                    }, 1400)
                }
            } else {
                playScanSound("success")
                setTimeout(() => {
                    onScan(raw)
                    onClose()
                }, 350)
            }
        },
        [allowRapidRestock, onQuickRestock, scanMode, packSize, onScan, onClose],
    )

    // Continuous real-time barcode decoding using ZXing multi-format reader engine
    useEffect(() => {
        if (!isOpen || !stream || cameraError || !videoRef.current) {
            return
        }

        let isSubscribed = true
        const codeReader = new BrowserMultiFormatReader(zxingHints, 180)

        try {
            codeReader.decodeFromVideoElementContinuously(
                videoRef.current,
                (result) => {
                    if (!isSubscribed || scanLockRef.current) return
                    if (result) {
                        const raw = result.getText().trim()
                        if (raw) {
                            void handleProcessCode(raw)
                        }
                    }
                },
            )
        } catch {
            // ZXing stream initialization failed
        }

        return () => {
            isSubscribed = false
            try {
                codeReader.reset()
            } catch {
                // Ignore cleanup error
            }
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
                            <h2 className="font-serif-brand text-base font-bold text-[#1C1917]">
                                {title}
                            </h2>
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
                                <div className="relative w-64 h-36 rounded-xl border-2 border-dashed border-amber-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                                    {/* Corner accents */}
                                    <div className="absolute -top-1 -left-1 size-4 border-t-3 border-l-3 border-amber-400" />
                                    <div className="absolute -top-1 -right-1 size-4 border-t-3 border-r-3 border-amber-400" />
                                    <div className="absolute -bottom-1 -left-1 size-4 border-b-3 border-l-3 border-amber-400" />
                                    <div className="absolute -bottom-1 -right-1 size-4 border-b-3 border-r-3 border-amber-400" />

                                    {/* Scanning line animation */}
                                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-pulse absolute top-1/2 -translate-y-1/2 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                                </div>

                                <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-white/90 font-medium bg-black/60 backdrop-blur-xs px-3 py-1 rounded-full whitespace-nowrap shadow-xs">
                                    Hold barcode steady 15–20cm from camera
                                </p>
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
                                <div className="absolute inset-0 bg-[#215A36]/90 flex flex-col items-center justify-center text-white p-4 animate-in fade-in duration-100 z-20">
                                    <CheckCircle2 className="size-12 text-[#A7F3D0] animate-bounce" />
                                    <p className="mt-2 text-sm font-bold tracking-tight">
                                        Barcode Detected
                                    </p>
                                    <p className="font-mono text-base font-extrabold bg-black/20 px-3 py-1 rounded-lg mt-1 tracking-wider">
                                        {scannedCode}
                                    </p>
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
                                    placeholder="e.g. 012345678905 or SKU..."
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
