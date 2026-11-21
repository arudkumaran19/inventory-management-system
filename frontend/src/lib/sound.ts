/**
 * Audio feedback for barcode scanning and POS operations using the Web Audio API.
 * Synthesizes crisp, unobtrusive register sounds without requiring external audio assets.
 */
export function playScanSound(type: "success" | "error" = "success") {
    try {
        const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext
        if (!AudioContextClass) return

        const ctx = new AudioContextClass()
        if (ctx.state === "suspended") {
            void ctx.resume()
        }

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)

        if (type === "success") {
            // High, clean 1760 Hz (A6) register chime
            osc.type = "sine"
            osc.frequency.setValueAtTime(1760, ctx.currentTime)
            gain.gain.setValueAtTime(0.12, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.12)
        } else {
            // Low double buzz for unknown barcode / error
            osc.type = "triangle"
            osc.frequency.setValueAtTime(260, ctx.currentTime)
            gain.gain.setValueAtTime(0.15, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.22)
        }
    } catch {
        // AudioContext might be blocked until first user interaction; ignore silently
    }
}

