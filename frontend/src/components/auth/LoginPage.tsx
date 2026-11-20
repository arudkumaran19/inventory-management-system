import { useState } from "react"
import {
    AlertCircle,
    CheckCircle2,
    Coffee,
    Eye,
    EyeOff,
    KeyRound,
    Lock,
    Mail,
    Sparkles,
} from "lucide-react"
import { useAuth } from "../../context/AuthContext"

export function LoginPage() {
    const { login, error, clearError } = useAuth()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [localError, setLocalError] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!email.trim() || !password) {
            setLocalError("Please enter both email and password")
            return
        }

        setLocalError(null)
        clearError()
        setIsSubmitting(true)

        try {
            await login(email.trim(), password)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Invalid email or password"
            setLocalError(msg)
        } finally {
            setIsSubmitting(false)
        }
    }

    const fillDemoCredentials = (demoEmail: string, demoPass: string) => {
        setEmail(demoEmail)
        setPassword(demoPass)
        setLocalError(null)
        clearError()
    }

    const activeError = localError || error

    return (
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] px-4 py-12 select-none">
            {/* Subtle background ambient warmth */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-96 rounded-full bg-[#78350F]/5 blur-3xl" />
                <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 size-96 rounded-full bg-[#4E6047]/5 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Brand Card */}
                <div className="rounded-3xl border border-[#E8E3DB] bg-white p-8 shadow-xl shadow-[#78350F]/5">
                    {/* Header */}
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center">
                            <div className="relative flex size-14 items-center justify-center rounded-2xl bg-[#78350F] text-white shadow-md shadow-[#78350F]/20">
                                <Coffee className="size-7 text-[#F5F1EA]" />
                                <span className="absolute -top-1 -right-1 size-3 rounded-full bg-[#4E6047] ring-4 ring-white" />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-center gap-2">
                            <h1 className="font-serif-brand text-2xl font-bold tracking-tight text-[#1C1917]">
                                Artisan Café
                            </h1>
                            <span className="rounded-md bg-[#78350F]/10 px-2 py-0.5 text-[11px] font-bold tracking-widest text-[#78350F] uppercase">
                                POS
                            </span>
                        </div>
                        <p className="mt-1.5 text-xs font-medium text-[#78716C]">
                            Sign in to begin your shift
                        </p>
                    </div>

                    {/* Quick-fill helper badges */}
                    <div className="mt-5 rounded-2xl border border-[#E8E3DB] bg-[#FAF8F5] p-3 text-center">
                        <p className="text-[11px] font-semibold text-[#78716C]">
                            Demo Accounts:
                        </p>
                        <div className="mt-2 flex items-center justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => fillDemoCredentials("manager@example.com", "ManagerPass123!")}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C5] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:border-[#78350F] hover:text-[#78350F] transition-colors"
                            >
                                <Sparkles className="size-3 text-[#78350F]" />
                                Manager
                            </button>
                            <button
                                type="button"
                                onClick={() => fillDemoCredentials("cashier@example.com", "CashierPass123!")}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8D1C5] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:border-[#4E6047] hover:text-[#4E6047] transition-colors"
                            >
                                <Sparkles className="size-3 text-[#4E6047]" />
                                Cashier
                            </button>
                        </div>
                    </div>

                    {/* Error Banner */}
                    {activeError && (
                        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#F8C8C8] bg-[#FDF2F2] p-3.5 text-xs text-[#9B2C2C] animate-in fade-in slide-in-from-top-2 duration-150">
                            <AlertCircle className="size-4 shrink-0 text-[#9B2C2C] mt-0.5" />
                            <div className="flex-1">
                                <p className="font-semibold text-[#9B2C2C]">Sign-in Failed</p>
                                <p className="mt-0.5 text-[#9B2C2C]/90 leading-relaxed">{activeError}</p>
                            </div>
                        </div>
                    )}

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-[#292524] mb-1.5">
                                Email
                            </label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#A8A29E]">
                                    <Mail className="size-4" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value)
                                        if (activeError) setLocalError(null)
                                    }}
                                    placeholder="name@example.com"
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] py-2.5 pl-10 pr-4 text-sm text-[#1C1917] placeholder-[#A8A29E] transition-colors focus:border-[#78350F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78350F]/15"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-[#292524] mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#A8A29E]">
                                    <Lock className="size-4" />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value)
                                        if (activeError) setLocalError(null)
                                    }}
                                    placeholder="••••••••••••"
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5] py-2.5 pl-10 pr-10 text-sm text-[#1C1917] placeholder-[#A8A29E] transition-colors focus:border-[#78350F] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#78350F]/15"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#A8A29E] hover:text-[#292524]"
                                    tabIndex={-1}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? (
                                        <EyeOff className="size-4" />
                                    ) : (
                                        <Eye className="size-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#78350F] py-3 text-sm font-semibold text-white shadow-md shadow-[#78350F]/15 transition-all hover:bg-[#5A270B] active:scale-[0.99] disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <>
                                    <KeyRound className="size-4" />
                                    <span>Sign In</span>
                                </>
                            )}
                        </button>
                    </form>

                    {/* Security Footer Note */}
                    <div className="mt-7 border-t border-[#E8E3DB] pt-5 flex items-center justify-center gap-1.5 text-[11px] text-[#78716C]">
                        <CheckCircle2 className="size-3.5 text-[#4E6047]" />
                        <span>Secure session · Role-based access</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
