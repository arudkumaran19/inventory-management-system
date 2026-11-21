import { useEffect, useRef } from "react"

type UseBarcodeScannerOptions = {
    onScan: (barcode: string) => void
    enabled?: boolean
    /** Max time between keypresses to be considered a hardware barcode scanner burst (default 60ms) */
    maxInterval?: number
    /** Minimum barcode string length (default 3) */
    minLength?: number
}

/**
 * Hook to capture keyboard-wedge USB and Bluetooth barcode scanners.
 * Hardware scanners send character keystrokes with rapid inter-character delays (< 40ms)
 * terminated by an Enter key.
 */
export function useBarcodeScanner({
    onScan,
    enabled = true,
    maxInterval = 65,
    minLength = 3,
}: UseBarcodeScannerOptions) {
    const bufferRef = useRef<string[]>([])
    const lastKeyTimeRef = useRef<number>(0)
    const onScanRef = useRef(onScan)

    useEffect(() => {
        onScanRef.current = onScan
    }, [onScan])

    useEffect(() => {
        if (!enabled) return

        const handleKeyDown = (e: KeyboardEvent) => {
            const now = Date.now()
            const timeDiff = now - lastKeyTimeRef.current

            // Check if user is typing in an active text input or textarea
            const target = e.target as HTMLElement | null
            const isInputTarget =
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable)

            if (e.key === "Enter") {
                // If we have accumulated characters rapidly, process as barcode
                if (bufferRef.current.length >= minLength) {
                    const scannedBarcode = bufferRef.current.join("").trim()
                    if (scannedBarcode.length >= minLength) {
                        e.preventDefault()
                        e.stopPropagation()
                        onScanRef.current(scannedBarcode)
                    }
                }
                bufferRef.current = []
                lastKeyTimeRef.current = 0
                return
            }

            // Printable single character keys
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                // If the interval between characters was too long, reset the buffer
                if (lastKeyTimeRef.current > 0 && timeDiff > maxInterval) {
                    // Slow typing -> if in an input field, let normal typing happen
                    bufferRef.current = [e.key]
                } else {
                    // Rapid keystroke -> append to buffer
                    bufferRef.current.push(e.key)
                }
                lastKeyTimeRef.current = now

                // If user is NOT in an input field and scanner is sending characters, prevent unwanted scrolling/shortcuts
                if (!isInputTarget && bufferRef.current.length > 1) {
                    e.stopPropagation()
                }
            }
        }

        window.addEventListener("keydown", handleKeyDown, true)

        return () => {
            window.removeEventListener("keydown", handleKeyDown, true)
        }
    }, [enabled, maxInterval, minLength])
}

