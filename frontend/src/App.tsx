import { useState } from "react"
import { Coffee } from "lucide-react"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { LoginPage } from "./components/auth/LoginPage"
import { AppShell } from "./components/layout/AppShell"
import type { AppPage } from "./components/layout/Sidebar"
import { POSPage } from "./components/products/POSPage"
import { OrderHistory } from "./components/orders/OrderHistory"
import { InventoryView } from "./components/inventory/InventoryView"
import { UserManagementView } from "./components/users/UserManagementView"

const pageTitles: Record<AppPage, string> = {
    pos: "POS",
    orders: "Sales History",
    inventory: "Stock",
    users: "Staff",
}

function AuthenticatedPOS() {
    const { isAuthenticated, isLoading, isManager } = useAuth()
    const [activePage, setActivePage] = useState<AppPage>("pos")

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] text-stone-900">
                <div className="flex flex-col items-center gap-3.5">
                    <div className="flex size-14 items-center justify-center rounded-2xl border border-[#E8E3DB] bg-white text-[#78350F] shadow-sm">
                        <Coffee className="size-7 animate-pulse text-[#78350F]" />
                    </div>
                    <div className="text-center">
                        <p className="font-serif-brand text-lg font-semibold text-[#1C1917]">
                            Artisan Café POS
                        </p>
                        <p className="mt-0.5 text-xs font-medium text-stone-500">
                            Loading POS...
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        return <LoginPage />
    }

    // Safety fallback: Cashiers cannot access Inventory or User Management
    const safeActivePage: AppPage =
        (activePage === "inventory" || activePage === "users") && !isManager
            ? "pos"
            : activePage

    const renderPage = () => {
        switch (safeActivePage) {
            case "pos":
                return <POSPage />

            case "orders":
                return <OrderHistory />

            case "inventory":
                return isManager ? <InventoryView /> : <POSPage />

            case "users":
                return isManager ? <UserManagementView /> : <POSPage />
        }
    }

    return (
        <AppShell
            title={pageTitles[safeActivePage]}
            activePage={safeActivePage}
            onNavigate={setActivePage}
        >
            {renderPage()}
        </AppShell>
    )
}

function App() {
    return (
        <AuthProvider>
            <AuthenticatedPOS />
        </AuthProvider>
    )
}

export default App