import { useEffect, useMemo, useState } from "react"
import {
    AlertCircle,
    CheckCircle2,
    Crown,
    Edit3,
    Eye,
    EyeOff,
    RefreshCw,
    Search,
    ShieldCheck,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
    UserX,
    X,
} from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import {
    createUser,
    deleteUser,
    getUsers,
    updateUser,
} from "../../lib/api"
import type { CreateUserData, UpdateUserData, User } from "../../types/auth"
import { Toast } from "../ui/Toast"

type UserFilter = "all" | "admin" | "manager" | "cashier" | "active" | "inactive"

export function UserManagementView() {
    const { user: currentUser, isAdmin } = useAuth()
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [toastMessage, setToastMessage] = useState<string | null>(null)
    const [toastVariant, setToastVariant] = useState<"success" | "error">("success")

    // Filter and search state
    const [searchQuery, setSearchQuery] = useState("")
    const [filter, setFilter] = useState<UserFilter>("all")

    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [userToEdit, setUserToEdit] = useState<User | null>(null)
    const [userToDelete, setUserToDelete] = useState<User | null>(null)

    // Form states
    const [formData, setFormData] = useState<CreateUserData>({
        email: "",
        display_name: "",
        role: "cashier",
        password: "",
    })
    const [editFormData, setEditFormData] = useState<UpdateUserData>({
        display_name: "",
        role: "cashier",
        is_active: true,
        password: "",
    })
    const [showPassword, setShowPassword] = useState(false)
    const [modalError, setModalError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function refreshUsers(showRefreshAnimation = false) {
        if (showRefreshAnimation) setRefreshing(true)
        else setLoading(true)
        setError(null)

        try {
            const data = await getUsers()
            setUsers(data)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to load staff."
            setError(msg)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        let ignore = false
        getUsers()
            .then((data) => {
                if (!ignore) {
                    setUsers(data)
                    setLoading(false)
                }
            })
            .catch((err) => {
                if (!ignore) {
                    const msg = err instanceof Error ? err.message : "Failed to load staff."
                    setError(msg)
                    setLoading(false)
                }
            })

        return () => {
            ignore = true
        }
    }, [])

    const filteredUsers = useMemo(() => {
        return users.filter((u) => {
            const matchesSearch =
                u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email.toLowerCase().includes(searchQuery.toLowerCase())

            if (!matchesSearch) return false

            if (filter === "admin") return u.role === "admin"
            if (filter === "manager") return u.role === "manager"
            if (filter === "cashier") return u.role === "cashier"
            if (filter === "active") return u.is_active
            if (filter === "inactive") return !u.is_active
            return true
        })
    }, [users, searchQuery, filter])

    const stats = useMemo(() => {
        const total = users.length
        const admins = users.filter((u) => u.role === "admin" && u.is_active).length
        const managers = users.filter((u) => u.role === "manager" && u.is_active).length
        const cashiers = users.filter((u) => u.role === "cashier" && u.is_active).length
        const inactive = users.filter((u) => !u.is_active).length
        return { total, admins, managers, cashiers, inactive }
    }, [users])

    function openAddModal() {
        setFormData({
            email: "",
            display_name: "",
            role: "cashier",
            password: "",
        })
        setShowPassword(false)
        setModalError(null)
        setIsAddModalOpen(true)
    }

    function openEditModal(target: User) {
        setUserToEdit(target)
        setEditFormData({
            display_name: target.display_name,
            role: target.role,
            is_active: target.is_active,
            password: "",
        })
        setShowPassword(false)
        setModalError(null)
        setIsEditModalOpen(true)
    }

    async function handleCreateUser(e: React.FormEvent) {
        e.preventDefault()
        setModalError(null)

        if (formData.password.length < 12) {
            setModalError("Password must be at least 12 characters.")
            return
        }

        if (formData.role === "admin" && !isAdmin) {
            setModalError("Only Administrators can assign the Administrator role.")
            return
        }

        setIsSubmitting(true)
        try {
            const created = await createUser({
                ...formData,
                email: formData.email.trim(),
                display_name: formData.display_name.trim(),
            })
            setUsers((prev) => [...prev, created])
            setIsAddModalOpen(false)
            setToastVariant("success")
            setToastMessage(`Staff account created for ${created.display_name} (${created.role}).`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to create user account."
            setModalError(msg)
        } finally {
            setIsSubmitting(false)
        }
    }

    async function handleUpdateUser(e: React.FormEvent) {
        e.preventDefault()
        if (!userToEdit) return
        setModalError(null)

        if (userToEdit.role === "admin" && !isAdmin) {
            setModalError("Managers cannot modify Administrator accounts.")
            return
        }

        if (editFormData.role === "admin" && !isAdmin) {
            setModalError("Only Administrators can promote an account to Administrator.")
            return
        }

        if (editFormData.password && editFormData.password.length < 12) {
            setModalError("New password must be at least 12 characters.")
            return
        }

        setIsSubmitting(true)
        try {
            const payload: UpdateUserData = {
                display_name: editFormData.display_name?.trim(),
                role: editFormData.role,
                is_active: editFormData.is_active,
            }
            if (editFormData.password && editFormData.password.trim()) {
                payload.password = editFormData.password
            }

            const updated = await updateUser(userToEdit.id, payload)
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
            setIsEditModalOpen(false)
            setToastVariant("success")
            setToastMessage(`Staff member "${updated.display_name}" updated.`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to update staff member."
            setModalError(msg)
        } finally {
            setIsSubmitting(false)
        }
    }

    async function handleToggleActive(target: User) {
        if (target.id === currentUser?.id) {
            setToastVariant("error")
            setToastMessage("You cannot deactivate your own account.")
            return
        }

        if (target.role === "admin" && !isAdmin) {
            setToastVariant("error")
            setToastMessage("Managers cannot deactivate Administrator accounts.")
            return
        }

        const newStatus = !target.is_active
        try {
            const updated = await updateUser(target.id, { is_active: newStatus })
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
            setToastVariant("success")
            setToastMessage(
                newStatus
                    ? `Staff member "${target.display_name}" activated.`
                    : `Staff member "${target.display_name}" deactivated.`,
            )
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to change account status."
            setToastVariant("error")
            setToastMessage(msg)
        }
    }

    async function handleDeleteUser() {
        if (!userToDelete) return
        if (userToDelete.id === currentUser?.id) {
            setToastVariant("error")
            setToastMessage("You cannot delete your own account.")
            setUserToDelete(null)
            return
        }

        if (userToDelete.role === "admin" && !isAdmin) {
            setToastVariant("error")
            setToastMessage("Managers cannot delete Administrator accounts.")
            setUserToDelete(null)
            return
        }

        try {
            await deleteUser(userToDelete.id)
            setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id))
            setToastVariant("success")
            setToastMessage(`Staff member "${userToDelete.display_name}" deleted.`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to delete staff member."
            setToastVariant("error")
            setToastMessage(msg)
        } finally {
            setUserToDelete(null)
        }
    }

    return (
        <div className="flex-1 space-y-6 p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto">
            {toastMessage && (
                <Toast
                    message={toastMessage}
                    variant={toastVariant}
                    onClose={() => setToastMessage(null)}
                />
            )}

            {/* Header section */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                            <Users className="size-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="font-serif-brand text-2xl font-medium tracking-tight text-[#1C1917]">
                                    Staff &amp; Access Control
                                </h1>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border border-purple-200 bg-purple-50 text-purple-800">
                                    <Crown className="size-3 text-purple-600" />
                                    RBAC Enabled
                                </span>
                            </div>
                            <p className="text-xs text-[#78716C] mt-0.5">
                                Manage team accounts, role-based permissions, and register authorization.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => refreshUsers(true)}
                        disabled={refreshing || loading}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#E8E3DB] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#1C1917] shadow-xs hover:bg-[#FAF8F5] hover:border-[#D6CEC4] transition-all disabled:opacity-50 cursor-pointer"
                        title="Refresh list"
                    >
                        <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin text-[#78350F]" : "text-[#78716C]"}`} />
                        <span>Refresh</span>
                    </button>

                    <button
                        type="button"
                        onClick={openAddModal}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#78350F] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#5C2B09] transition-all cursor-pointer active:scale-98"
                    >
                        <UserPlus className="size-4 text-[#FDE68A]" />
                        <span>Add Staff Member</span>
                    </button>
                </div>
            </div>

            {/* Stat Capsules */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                    <div className="flex items-center justify-between text-[#78716C]">
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Total Staff</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-[#F5F2EB] text-[#78716C] border border-[#E8E3DB]">
                            <Users className="size-3.5" />
                        </div>
                    </div>
                    <p className="mt-2 font-serif-brand text-2xl font-bold tracking-tight text-[#1C1917] tnum">{stats.total}</p>
                    <p className="text-[11px] text-[#78716C] mt-0.5">All accounts</p>
                </div>

                <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-xs transition hover:shadow-md hover:border-purple-300">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-purple-800 uppercase tracking-wider">Admins</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-purple-100 text-purple-800 border border-purple-200">
                            <Crown className="size-3.5" />
                        </div>
                    </div>
                    <p className="mt-2 font-serif-brand text-2xl font-bold tracking-tight text-purple-900 tnum">{stats.admins}</p>
                    <p className="text-[11px] text-purple-700 mt-0.5">Full system control</p>
                </div>

                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[#78350F] uppercase tracking-wider">Managers</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                            <ShieldCheck className="size-3.5" />
                        </div>
                    </div>
                    <p className="mt-2 font-serif-brand text-2xl font-bold tracking-tight text-[#78350F] tnum">{stats.managers}</p>
                    <p className="text-[11px] text-[#78716C] mt-0.5">Menu &amp; stock ops</p>
                </div>

                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[#4E6047] uppercase tracking-wider">Cashiers</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-[#EDF6EE] text-[#4E6047] border border-[#CFDFCF]">
                            <UserCheck className="size-3.5" />
                        </div>
                    </div>
                    <p className="mt-2 font-serif-brand text-2xl font-bold tracking-tight text-[#4E6047] tnum">{stats.cashiers}</p>
                    <p className="text-[11px] text-[#78716C] mt-0.5">POS &amp; checkout</p>
                </div>

                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-4 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[#78716C] uppercase tracking-wider">Deactivated</span>
                        <div className="flex size-7 items-center justify-center rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                            <UserX className="size-3.5" />
                        </div>
                    </div>
                    <p className="mt-2 font-serif-brand text-2xl font-bold tracking-tight text-[#1C1917] tnum">{stats.inactive}</p>
                    <p className="text-[11px] text-[#78716C] mt-0.5">Inactive accounts</p>
                </div>
            </div>

            {/* Filter and Search controls */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-[#E8E3DB] bg-white p-3 shadow-xs">
                <div className="relative flex-1 max-w-md">
                    <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-[#A8A29E]" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search staff by name or email..."
                        className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 py-2 pl-9 pr-3 text-xs text-[#1C1917] placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:outline-none focus:ring-1 focus:ring-[#78350F]"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {(
                        [
                            { id: "all", label: "All" },
                            { id: "admin", label: "Admins" },
                            { id: "manager", label: "Managers" },
                            { id: "cashier", label: "Cashiers" },
                            { id: "active", label: "Active" },
                            { id: "inactive", label: "Deactivated" },
                        ] as const
                    ).map((btn) => (
                        <button
                            key={btn.id}
                            type="button"
                            onClick={() => setFilter(btn.id)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                                filter === btn.id
                                    ? "bg-[#78350F] text-white shadow-xs"
                                    : "text-[#78716C] hover:bg-[#FAF8F5] hover:text-[#1C1917]"
                            }`}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Users Table / List */}
            <div className="overflow-hidden rounded-2xl border border-[#E8E3DB] bg-white shadow-xs">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-[#78716C] gap-2">
                        <RefreshCw className="size-6 animate-spin text-[#78350F]" />
                        <span className="text-xs font-medium">Loading staff...</span>
                    </div>
                ) : error ? (
                    <div className="p-8 text-center">
                        <p className="text-xs font-medium text-rose-700">{error}</p>
                        <button
                            type="button"
                            onClick={() => refreshUsers()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] cursor-pointer"
                        >
                            <RefreshCw className="size-3 text-[#78716C]" />
                            Try Again
                        </button>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-12 text-center text-[#78716C]">
                        <Users className="mx-auto size-8 text-[#A8A29E] stroke-[1.5]" />
                        <p className="mt-2 text-xs font-semibold text-[#1C1917]">No staff members found</p>
                        <p className="mt-1 text-[11px] text-[#A8A29E]">
                            {searchQuery ? "Try refining your search filter." : "Get started by adding staff."}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-[#E8E3DB] bg-[#FAF8F5]/80 text-[10px] font-bold uppercase tracking-wider text-[#78716C]">
                                    <th className="py-3 pl-5 pr-3">Name / ID</th>
                                    <th className="px-3 py-3">Email Address</th>
                                    <th className="px-3 py-3">Role / Permissions</th>
                                    <th className="px-3 py-3">Status</th>
                                    <th className="px-3 py-3">Registered</th>
                                    <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]/60">
                                {filteredUsers.map((u) => {
                                    const isSelf = u.id === currentUser?.id
                                    const isTargetAdmin = u.role === "admin"
                                    const canModify = isAdmin || !isTargetAdmin
                                    const initials = u.display_name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .slice(0, 2)
                                        .toUpperCase()

                                    return (
                                        <tr
                                            key={u.id}
                                            className={`transition-colors hover:bg-[#FAF8F5] ${
                                                !u.is_active ? "opacity-60 bg-[#F5F2EB]/40" : ""
                                            }`}
                                        >
                                            <td className="py-3.5 pl-5 pr-3">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={`flex size-8 items-center justify-center rounded-xl text-xs font-serif-brand font-bold ${
                                                            u.role === "admin"
                                                                ? "bg-purple-100 text-purple-800 border border-purple-200"
                                                                : u.role === "manager"
                                                                    ? "bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]"
                                                                    : "bg-[#EDF6EE] text-[#4E6047] border border-[#CFDFCF]"
                                                        }`}
                                                    >
                                                        {initials || "ST"}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-[#1C1917]">
                                                                {u.display_name}
                                                            </span>
                                                            {isSelf && (
                                                                <span className="rounded bg-[#FEF8EC] border border-[#F2DEBA] px-1.5 py-0.2 text-[9px] font-bold text-[#78350F] uppercase">
                                                                    You
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-[#A8A29E] tnum">ID #{u.id}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3.5 text-[#78716C] font-mono text-[11px]">
                                                {u.email}
                                            </td>
                                            <td className="px-3 py-3.5">
                                                {u.role === "admin" ? (
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-800">
                                                        <Crown className="size-3 text-purple-700" />
                                                        Administrator
                                                    </span>
                                                ) : u.role === "manager" ? (
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-[#F2DEBA] bg-[#FEF8EC] px-2 py-0.5 text-[11px] font-semibold text-[#78350F]">
                                                        <ShieldCheck className="size-3 text-[#78350F]" />
                                                        Manager
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-[#CFDFCF] bg-[#EDF6EE] px-2 py-0.5 text-[11px] font-semibold text-[#4E6047]">
                                                        <UserCheck className="size-3 text-[#4E6047]" />
                                                        Cashier
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3.5">
                                                {u.is_active ? (
                                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDFCF] bg-[#EDF6EE] px-2 py-0.5 text-[11px] font-semibold text-[#4E6047]">
                                                        <span className="size-1.5 rounded-full bg-[#4E6047] animate-pulse" />
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                                        <UserX className="size-3 text-rose-600" />
                                                        Deactivated
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3.5 text-[11px] text-[#78716C] tnum">
                                                {new Date(u.created_at).toLocaleDateString(undefined, {
                                                    year: "numeric",
                                                    month: "short",
                                                    day: "numeric",
                                                })}
                                            </td>
                                            <td className="py-3.5 pl-3 pr-5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Toggle active */}
                                                    <button
                                                        type="button"
                                                        disabled={isSelf || !canModify}
                                                        onClick={() => handleToggleActive(u)}
                                                        title={
                                                            isSelf
                                                                ? "Cannot deactivate your own account"
                                                                : !canModify
                                                                    ? "Managers cannot deactivate Administrator accounts"
                                                                    : u.is_active
                                                                        ? "Deactivate account"
                                                                        : "Activate account"
                                                        }
                                                        className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                                                            isSelf || !canModify
                                                                ? "cursor-not-allowed opacity-30 text-[#A8A29E]"
                                                                : u.is_active
                                                                    ? "text-[#78716C] hover:bg-rose-50 hover:text-rose-700"
                                                                    : "text-[#78716C] hover:bg-[#EDF6EE] hover:text-[#4E6047]"
                                                        }`}
                                                    >
                                                        {u.is_active ? (
                                                            <UserX className="size-3.5" />
                                                        ) : (
                                                            <CheckCircle2 className="size-3.5 text-[#4E6047]" />
                                                        )}
                                                    </button>

                                                    {/* Edit */}
                                                    <button
                                                        type="button"
                                                        disabled={!canModify}
                                                        onClick={() => openEditModal(u)}
                                                        title={!canModify ? "Managers cannot modify Administrator accounts" : "Edit staff member"}
                                                        className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                                                            !canModify
                                                                ? "cursor-not-allowed opacity-30 text-[#A8A29E]"
                                                                : "text-[#78716C] hover:bg-[#FAF8F5] hover:text-[#78350F]"
                                                        }`}
                                                    >
                                                        <Edit3 className="size-3.5" />
                                                    </button>

                                                    {/* Delete */}
                                                    <button
                                                        type="button"
                                                        disabled={isSelf || !canModify}
                                                        onClick={() => setUserToDelete(u)}
                                                        title={
                                                            isSelf
                                                                ? "Cannot delete your own account"
                                                                : !canModify
                                                                    ? "Managers cannot delete Administrator accounts"
                                                                    : "Delete staff member"
                                                        }
                                                        className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                                                            isSelf || !canModify
                                                                ? "cursor-not-allowed opacity-30 text-[#A8A29E]"
                                                                : "text-[#78716C] hover:bg-rose-50 hover:text-rose-700"
                                                        }`}
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL: ADD OPERATOR */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-md rounded-3xl border border-[#E8E3DB] bg-white p-6 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#E8E3DB] pb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex size-9 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                    <UserPlus className="size-4" />
                                </div>
                                <h2 className="font-serif-brand text-base font-bold text-[#1C1917]">Add Staff Member</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="rounded-xl p-1.5 text-[#A8A29E] hover:bg-[#FAF8F5] hover:text-[#1C1917] transition cursor-pointer"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        {modalError && (
                            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                                <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
                                <span>{modalError}</span>
                            </div>
                        )}

                        <form onSubmit={handleCreateUser} className="mt-4 space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Full Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.display_name}
                                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                    placeholder="e.g. Maya Patel"
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 px-3 py-2 text-[#1C1917] placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:outline-none focus:ring-1 focus:ring-[#78350F]"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Email *
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="e.g. maya@example.com"
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 px-3 py-2 text-[#1C1917] placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:outline-none focus:ring-1 focus:ring-[#78350F]"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Role &amp; Permissions *
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: "cashier" })}
                                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                                            formData.role === "cashier"
                                                ? "border-[#CFDFCF] bg-[#EDF6EE] text-[#4E6047]"
                                                : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5]"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1 font-bold text-xs">
                                            <UserCheck className="size-3 text-[#4E6047]" />
                                            <span>Cashier</span>
                                        </div>
                                        <span className="mt-1 text-[9px] text-[#78716C] leading-tight">
                                            POS register
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: "manager" })}
                                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all cursor-pointer ${
                                            formData.role === "manager"
                                                ? "border-[#F2DEBA] bg-[#FEF8EC] text-[#78350F]"
                                                : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5]"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1 font-bold text-xs">
                                            <ShieldCheck className="size-3 text-[#78350F]" />
                                            <span>Manager</span>
                                        </div>
                                        <span className="mt-1 text-[9px] text-[#78716C] leading-tight">
                                            Menu &amp; stock
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        disabled={!isAdmin}
                                        onClick={() => setFormData({ ...formData, role: "admin" })}
                                        title={!isAdmin ? "Only Administrators can assign Administrator privileges" : ""}
                                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                                            !isAdmin
                                                ? "opacity-40 cursor-not-allowed border-[#E8E3DB] bg-[#F5F2EB]"
                                                : formData.role === "admin"
                                                    ? "border-purple-300 bg-purple-50 text-purple-800"
                                                    : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5] cursor-pointer"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1 font-bold text-xs">
                                            <Crown className="size-3 text-purple-700" />
                                            <span>Admin</span>
                                        </div>
                                        <span className="mt-1 text-[9px] text-[#78716C] leading-tight">
                                            Full system
                                        </span>
                                    </button>
                                </div>
                                {!isAdmin && (
                                    <p className="mt-1 text-[10px] text-[#78716C]">
                                        * Only Administrators can grant Administrator privileges.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Password * (At least 12 characters)
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        minLength={12}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="••••••••••••"
                                        className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 py-2 pl-3 pr-9 text-[#1C1917] placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:outline-none focus:ring-1 focus:ring-[#78350F]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#A8A29E] hover:text-[#1C1917] cursor-pointer"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E8E3DB]">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#78350F] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5C2B09] transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5 text-[#FDE68A]" />}
                                    <span>Create Account</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: EDIT OPERATOR */}
            {isEditModalOpen && userToEdit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-md rounded-3xl border border-[#E8E3DB] bg-white p-6 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[#E8E3DB] pb-4">
                            <div className="flex items-center gap-3">
                                <div className="flex size-9 items-center justify-center rounded-xl bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                                    <Edit3 className="size-4" />
                                </div>
                                <div>
                                    <h2 className="font-serif-brand text-base font-bold text-[#1C1917]">
                                        Edit Staff Member
                                    </h2>
                                    <p className="text-[10px] text-[#78716C]">{userToEdit.email}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="rounded-xl p-1.5 text-[#A8A29E] hover:bg-[#FAF8F5] hover:text-[#1C1917] transition cursor-pointer"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        {modalError && (
                            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                                <AlertCircle className="size-4 shrink-0 text-rose-600 mt-0.5" />
                                <span>{modalError}</span>
                            </div>
                        )}

                        <form onSubmit={handleUpdateUser} className="mt-4 space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editFormData.display_name}
                                    onChange={(e) =>
                                        setEditFormData({ ...editFormData, display_name: e.target.value })
                                    }
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 px-3 py-2 text-[#1C1917] placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:outline-none focus:ring-1 focus:ring-[#78350F]"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">Role &amp; Permissions</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        disabled={userToEdit.id === currentUser?.id}
                                        onClick={() => setEditFormData({ ...editFormData, role: "cashier" })}
                                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                                            userToEdit.id === currentUser?.id
                                                ? "opacity-40 cursor-not-allowed border-[#E8E3DB] bg-[#F5F2EB]"
                                                : editFormData.role === "cashier"
                                                    ? "border-[#CFDFCF] bg-[#EDF6EE] text-[#4E6047]"
                                                    : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5] cursor-pointer"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1 font-bold text-xs">
                                            <UserCheck className="size-3 text-[#4E6047]" />
                                            <span>Cashier</span>
                                        </div>
                                        <span className="mt-1 text-[9px] text-[#78716C] leading-tight">
                                            POS register
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        disabled={userToEdit.id === currentUser?.id}
                                        onClick={() => setEditFormData({ ...editFormData, role: "manager" })}
                                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                                            userToEdit.id === currentUser?.id
                                                ? "opacity-40 cursor-not-allowed border-[#F2DEBA] bg-[#FEF8EC] text-[#78350F]"
                                                : editFormData.role === "manager"
                                                    ? "border-[#F2DEBA] bg-[#FEF8EC] text-[#78350F]"
                                                    : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5] cursor-pointer"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1 font-bold text-xs">
                                            <ShieldCheck className="size-3 text-[#78350F]" />
                                            <span>Manager</span>
                                        </div>
                                        <span className="mt-1 text-[9px] text-[#78716C] leading-tight">
                                            Menu &amp; stock
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        disabled={!isAdmin || userToEdit.id === currentUser?.id}
                                        onClick={() => setEditFormData({ ...editFormData, role: "admin" })}
                                        title={!isAdmin ? "Only Administrators can assign Administrator privileges" : ""}
                                        className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                                            !isAdmin || userToEdit.id === currentUser?.id
                                                ? "opacity-40 cursor-not-allowed border-[#E8E3DB] bg-[#F5F2EB]"
                                                : editFormData.role === "admin"
                                                    ? "border-purple-300 bg-purple-50 text-purple-800"
                                                    : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5] cursor-pointer"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1 font-bold text-xs">
                                            <Crown className="size-3 text-purple-700" />
                                            <span>Admin</span>
                                        </div>
                                        <span className="mt-1 text-[9px] text-[#78716C] leading-tight">
                                            Full system
                                        </span>
                                    </button>
                                </div>
                                {userToEdit.id === currentUser?.id && (
                                    <p className="mt-1 text-[10px] text-[#78350F]">
                                        You cannot change your own role.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Account Status
                                </label>
                                <div className="flex items-center justify-between rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 p-3">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className={`size-2.5 rounded-full ${
                                                editFormData.is_active ? "bg-[#4E6047]" : "bg-rose-500"
                                            }`}
                                        />
                                        <div>
                                            <p className="font-semibold text-[#1C1917]">
                                                {editFormData.is_active ? "Active" : "Deactivated"}
                                            </p>
                                            <p className="text-[10px] text-[#78716C]">
                                                {editFormData.is_active
                                                    ? "Account can sign in and operate the POS"
                                                    : "Account is blocked from logging in"}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={userToEdit.id === currentUser?.id}
                                        onClick={() =>
                                            setEditFormData({
                                                ...editFormData,
                                                is_active: !editFormData.is_active,
                                            })
                                        }
                                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
                                            userToEdit.id === currentUser?.id
                                                ? "opacity-30 cursor-not-allowed border-[#E8E3DB] bg-white text-[#A8A29E]"
                                                : editFormData.is_active
                                                    ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                                                    : "border-[#CFDFCF] bg-white text-[#4E6047] hover:bg-[#EDF6EE]"
                                        }`}
                                    >
                                        {editFormData.is_active ? "Deactivate" : "Activate"}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Reset Password (Optional)
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        minLength={12}
                                        value={editFormData.password}
                                        onChange={(e) =>
                                            setEditFormData({ ...editFormData, password: e.target.value })
                                        }
                                        placeholder="Leave blank to keep current password"
                                        className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 py-2 pl-3 pr-9 text-[#1C1917] placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:outline-none focus:ring-1 focus:ring-[#78350F]"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#A8A29E] hover:text-[#1C1917] cursor-pointer"
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#E8E3DB]">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#78350F] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5C2B09] transition disabled:opacity-50 cursor-pointer"
                                >
                                    {isSubmitting ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5 text-[#FDE68A]" />}
                                    <span>Save Changes</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: DELETE CONFIRMATION */}
            {userToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="w-full max-w-sm rounded-3xl border border-[#E8E3DB] bg-white p-6 shadow-2xl">
                        <div className="flex size-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 border border-rose-200">
                            <Trash2 className="size-5" />
                        </div>
                        <h2 className="mt-4 font-serif-brand text-base font-bold text-[#1C1917]">
                            Delete Staff Member?
                        </h2>
                        <p className="mt-1 text-xs text-[#78716C]">
                            Are you sure you want to permanently delete{" "}
                            <span className="font-semibold text-[#1C1917]">"{userToDelete.display_name}"</span> (
                            {userToDelete.email})? This action cannot be undone.
                        </p>
                        <div className="mt-5 flex items-center justify-end gap-2.5">
                            <button
                                type="button"
                                onClick={() => setUserToDelete(null)}
                                className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5] transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteUser}
                                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 transition cursor-pointer"
                            >
                                Delete Account
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
