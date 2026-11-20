import { useEffect, useMemo, useState } from "react"
import {
    AlertCircle,
    CheckCircle2,
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

type UserFilter = "all" | "manager" | "cashier" | "active" | "inactive"

export function UserManagementView() {
    const { user: currentUser } = useAuth()
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
            const msg = err instanceof Error ? err.message : "Failed to load team operators."
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
                    const msg = err instanceof Error ? err.message : "Failed to load team operators."
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

            if (filter === "manager") return u.role === "manager"
            if (filter === "cashier") return u.role === "cashier"
            if (filter === "active") return u.is_active
            if (filter === "inactive") return !u.is_active
            return true
        })
    }, [users, searchQuery, filter])

    const stats = useMemo(() => {
        const total = users.length
        const managers = users.filter((u) => u.role === "manager" && u.is_active).length
        const cashiers = users.filter((u) => u.role === "cashier" && u.is_active).length
        const inactive = users.filter((u) => !u.is_active).length
        return { total, managers, cashiers, inactive }
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

        if (!formData.display_name.trim() || !formData.email.trim() || !formData.password) {
            setModalError("Please complete all required fields.")
            return
        }

        if (formData.password.length < 12) {
            setModalError("Password must be at least 12 characters long.")
            return
        }

        setIsSubmitting(true)
        try {
            const newUser = await createUser(formData)
            setUsers((prev) => [...prev, newUser])
            setIsAddModalOpen(false)
            setToastVariant("success")
            setToastMessage(`Operator "${newUser.display_name}" created successfully.`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to create operator."
            setModalError(msg)
        } finally {
            setIsSubmitting(false)
        }
    }

    async function handleUpdateUser(e: React.FormEvent) {
        e.preventDefault()
        if (!userToEdit) return
        setModalError(null)

        if (editFormData.password && editFormData.password.length < 12) {
            setModalError("New password must be at least 12 characters long.")
            return
        }

        const payload: UpdateUserData = {
            display_name: editFormData.display_name?.trim(),
            role: editFormData.role,
            is_active: editFormData.is_active,
        }

        if (editFormData.password && editFormData.password.trim().length > 0) {
            payload.password = editFormData.password.trim()
        }

        setIsSubmitting(true)
        try {
            const updated = await updateUser(userToEdit.id, payload)
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
            setIsEditModalOpen(false)
            setToastVariant("success")
            setToastMessage(`Operator "${updated.display_name}" updated successfully.`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to update operator."
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

        const newStatus = !target.is_active
        try {
            const updated = await updateUser(target.id, { is_active: newStatus })
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
            setToastVariant("success")
            setToastMessage(
                newStatus
                    ? `Operator "${target.display_name}" activated.`
                    : `Operator "${target.display_name}" suspended. Active sessions terminated.`,
            )
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to toggle operator status."
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

        try {
            await deleteUser(userToDelete.id)
            setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id))
            setToastVariant("success")
            setToastMessage(`Operator "${userToDelete.display_name}" permanently deleted.`)
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to delete operator."
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
                            <h1 className="font-serif-brand text-2xl font-medium tracking-tight text-[#1C1917]">
                                Team & Operator Management
                            </h1>
                            <p className="text-xs text-[#78716C] mt-0.5">
                                Provision cashier & manager accounts, manage credentials, and control register privileges.
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
                        <span>Add Operator</span>
                    </button>
                </div>
            </div>

            {/* Stat Capsules */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                    <div className="flex items-center justify-between text-[#78716C]">
                        <span className="text-[11px] font-semibold uppercase tracking-wider">Total Staff</span>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-[#F5F2EB] text-[#78716C] border border-[#E8E3DB]">
                            <Users className="size-4" />
                        </div>
                    </div>
                    <p className="mt-3 font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">{stats.total}</p>
                    <p className="text-xs text-[#78716C] mt-1">Configured terminal operators</p>
                </div>

                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#78350F] uppercase tracking-wider">Managers</span>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]">
                            <ShieldCheck className="size-4" />
                        </div>
                    </div>
                    <p className="mt-3 font-serif-brand text-3xl font-medium tracking-tight text-[#78350F] tnum">{stats.managers}</p>
                    <p className="text-xs text-[#78716C] mt-1">Catalog & user admin rights</p>
                </div>

                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#4E6047] uppercase tracking-wider">Cashiers</span>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-[#EDF6EE] text-[#4E6047] border border-[#CFDFCF]">
                            <UserCheck className="size-4" />
                        </div>
                    </div>
                    <p className="mt-3 font-serif-brand text-3xl font-medium tracking-tight text-[#4E6047] tnum">{stats.cashiers}</p>
                    <p className="text-xs text-[#78716C] mt-1">Register & order processing</p>
                </div>

                <div className="rounded-2xl border border-[#E8E3DB] bg-white p-5 shadow-xs transition hover:shadow-md hover:border-[#D6CEC4]">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">Suspended</span>
                        <div className="flex size-8 items-center justify-center rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                            <UserX className="size-4" />
                        </div>
                    </div>
                    <p className="mt-3 font-serif-brand text-3xl font-medium tracking-tight text-[#1C1917] tnum">{stats.inactive}</p>
                    <p className="text-xs text-[#78716C] mt-1">Revoked access accounts</p>
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
                        placeholder="Search by name or email..."
                        className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 py-2 pl-9 pr-3 text-xs text-[#1C1917] placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:outline-none focus:ring-1 focus:ring-[#78350F]"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {(
                        [
                            { id: "all", label: "All" },
                            { id: "manager", label: "Managers" },
                            { id: "cashier", label: "Cashiers" },
                            { id: "active", label: "Active" },
                            { id: "inactive", label: "Suspended" },
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
                        <span className="text-xs font-medium">Loading operators...</span>
                    </div>
                ) : error ? (
                    <div className="p-8 text-center">
                        <AlertCircle className="mx-auto size-8 text-rose-600" />
                        <p className="mt-2 text-sm font-semibold text-rose-700">{error}</p>
                        <button
                            type="button"
                            onClick={() => refreshUsers()}
                            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[#E8E3DB] bg-white px-3 py-1.5 text-xs text-[#1C1917] hover:bg-[#FAF8F5] cursor-pointer"
                        >
                            Try Again
                        </button>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="py-16 text-center text-[#78716C]">
                        <Users className="mx-auto size-8 text-[#A8A29E]" />
                        <p className="mt-2 font-serif-brand text-base font-medium text-[#1C1917]">No operators found</p>
                        <p className="mt-0.5 text-xs text-[#78716C]">
                            {searchQuery ? "Try refining your search filter." : "Click 'Add Operator' to provision an account."}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[700px]">
                            <thead className="border-b border-[#E8E3DB] bg-[#F8F5EE] text-[11px] font-semibold text-[#78716C] uppercase tracking-wider">
                                <tr>
                                    <th className="py-3.5 pl-5 pr-3">Operator</th>
                                    <th className="px-3 py-3.5">Email</th>
                                    <th className="px-3 py-3.5">Role</th>
                                    <th className="px-3 py-3.5">Status</th>
                                    <th className="px-3 py-3.5">Created</th>
                                    <th className="py-3.5 pl-3 pr-5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E8E3DB]/60 font-medium text-[#1C1917]">
                                {filteredUsers.map((u) => {
                                    const isSelf = u.id === currentUser?.id
                                    const initials = u.display_name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .slice(0, 2)
                                        .join("")
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
                                                            u.role === "manager"
                                                                ? "bg-[#FEF8EC] text-[#78350F] border border-[#F2DEBA]"
                                                                : "bg-[#EDF6EE] text-[#4E6047] border border-[#CFDFCF]"
                                                        }`}
                                                    >
                                                        {initials || "OP"}
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
                                                {u.role === "manager" ? (
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
                                                        Suspended
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
                                                        disabled={isSelf}
                                                        onClick={() => handleToggleActive(u)}
                                                        title={
                                                            isSelf
                                                                ? "Cannot suspend your own account"
                                                                : u.is_active
                                                                ? "Suspend operator"
                                                                : "Activate operator"
                                                        }
                                                        className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                                                            isSelf
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
                                                        onClick={() => openEditModal(u)}
                                                        title="Edit operator"
                                                        className="rounded-lg p-1.5 text-[#78716C] transition-colors hover:bg-[#FAF8F5] hover:text-[#78350F] cursor-pointer"
                                                    >
                                                        <Edit3 className="size-3.5" />
                                                    </button>

                                                    {/* Delete */}
                                                    <button
                                                        type="button"
                                                        disabled={isSelf}
                                                        onClick={() => setUserToDelete(u)}
                                                        title={
                                                            isSelf
                                                                ? "Cannot delete your own account"
                                                                : "Delete operator"
                                                        }
                                                        className={`rounded-lg p-1.5 transition-colors cursor-pointer ${
                                                            isSelf
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
                                <h2 className="font-serif-brand text-base font-bold text-[#1C1917]">Add New Operator</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="rounded-lg p-1 text-[#78716C] hover:bg-[#F5F2EB] hover:text-[#1C1917] cursor-pointer"
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
                                    Operator Display Name *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.display_name}
                                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                                    placeholder="e.g. Maya Lin"
                                    className="w-full rounded-xl border border-[#E8E3DB] bg-[#FAF8F5]/60 px-3 py-2 text-[#1C1917] placeholder:text-[#A8A29E] focus:bg-white focus:border-[#78350F] focus:outline-none focus:ring-1 focus:ring-[#78350F]"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Email Address *
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
                                    Operator Role *
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: "cashier" })}
                                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer ${
                                            formData.role === "cashier"
                                                ? "border-[#CFDFCF] bg-[#EDF6EE] text-[#4E6047]"
                                                : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5]"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs">
                                            <UserCheck className="size-3.5 text-[#4E6047]" />
                                            <span>Cashier</span>
                                        </div>
                                        <span className="mt-1 text-[10px] text-[#78716C] leading-tight">
                                            Register, Cart, Orders & Payments
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, role: "manager" })}
                                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer ${
                                            formData.role === "manager"
                                                ? "border-[#F2DEBA] bg-[#FEF8EC] text-[#78350F]"
                                                : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5]"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs">
                                            <ShieldCheck className="size-3.5 text-[#78350F]" />
                                            <span>Manager</span>
                                        </div>
                                        <span className="mt-1 text-[10px] text-[#78716C] leading-tight">
                                            Catalog CRUD, Staff & Inventory
                                        </span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Initial Password * (Minimum 12 Characters)
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
                                <p className="mt-1 text-[10px] text-[#78716C]">
                                    Enforces security standard: minimum 12 characters.
                                </p>
                            </div>

                            <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#E8E3DB] pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 font-semibold text-[#78716C] hover:bg-[#FAF8F5] hover:text-[#1C1917] cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex items-center gap-1.5 rounded-xl bg-[#78350F] px-5 py-2 font-semibold text-white shadow-xs hover:bg-[#5C2B09] disabled:opacity-50 cursor-pointer active:scale-98"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <RefreshCw className="size-3.5 animate-spin" />
                                            <span>Creating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus className="size-3.5 text-[#FDE68A]" />
                                            <span>Create Operator</span>
                                        </>
                                    )}
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
                                    <h2 className="font-serif-brand text-base font-bold text-[#1C1917]">Edit Operator</h2>
                                    <p className="text-[11px] text-[#78716C] font-mono">{userToEdit.email}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="rounded-lg p-1 text-[#78716C] hover:bg-[#F5F2EB] hover:text-[#1C1917] cursor-pointer"
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
                                    Operator Display Name
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
                                <label className="block font-semibold text-[#1C1917] mb-1">Role</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        disabled={userToEdit.id === currentUser?.id}
                                        onClick={() => setEditFormData({ ...editFormData, role: "cashier" })}
                                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer ${
                                            userToEdit.id === currentUser?.id
                                                ? "opacity-40 cursor-not-allowed border-[#E8E3DB] bg-[#F5F2EB]"
                                                : editFormData.role === "cashier"
                                                ? "border-[#CFDFCF] bg-[#EDF6EE] text-[#4E6047]"
                                                : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5]"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs">
                                            <UserCheck className="size-3.5 text-[#4E6047]" />
                                            <span>Cashier</span>
                                        </div>
                                        <span className="mt-1 text-[10px] text-[#78716C] leading-tight">
                                            Standard Register
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        disabled={userToEdit.id === currentUser?.id}
                                        onClick={() => setEditFormData({ ...editFormData, role: "manager" })}
                                        className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer ${
                                            userToEdit.id === currentUser?.id
                                                ? "border-[#F2DEBA] bg-[#FEF8EC] text-[#78350F] cursor-not-allowed"
                                                : editFormData.role === "manager"
                                                ? "border-[#F2DEBA] bg-[#FEF8EC] text-[#78350F]"
                                                : "border-[#E8E3DB] bg-[#FAF8F5]/40 text-[#78716C] hover:bg-[#FAF8F5]"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-xs">
                                            <ShieldCheck className="size-3.5 text-[#78350F]" />
                                            <span>Manager</span>
                                        </div>
                                        <span className="mt-1 text-[10px] text-[#78716C] leading-tight">
                                            Admin Privileges
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
                                                {editFormData.is_active ? "Active Operator" : "Suspended"}
                                            </p>
                                            <p className="text-[10px] text-[#78716C]">
                                                {editFormData.is_active
                                                    ? "Able to log in and operate POS"
                                                    : "Access revoked; sessions terminated"}
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
                                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                                            userToEdit.id === currentUser?.id
                                                ? "opacity-30 cursor-not-allowed bg-[#F5F2EB] text-[#A8A29E]"
                                                : editFormData.is_active
                                                ? "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                                : "border border-[#CFDFCF] bg-[#EDF6EE] text-[#4E6047] hover:bg-[#DFEDDF]"
                                        }`}
                                    >
                                        {editFormData.is_active ? "Suspend" : "Activate"}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold text-[#1C1917] mb-1">
                                    Reset Password (Leave blank to keep unchanged)
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={editFormData.password || ""}
                                        onChange={(e) =>
                                            setEditFormData({ ...editFormData, password: e.target.value })
                                        }
                                        placeholder="New password (min 12 characters)"
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

                            <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#E8E3DB] pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 font-semibold text-[#78716C] hover:bg-[#FAF8F5] hover:text-[#1C1917] cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex items-center gap-1.5 rounded-xl bg-[#78350F] px-5 py-2 font-semibold text-white shadow-xs hover:bg-[#5C2B09] disabled:opacity-50 cursor-pointer active:scale-98"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <RefreshCw className="size-3.5 animate-spin" />
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <span>Save Changes</span>
                                    )}
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
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 border border-rose-200">
                                <Trash2 className="size-5" />
                            </div>
                            <div>
                                <h3 className="font-serif-brand text-sm font-bold text-[#1C1917]">Delete Operator Account?</h3>
                                <p className="text-xs text-[#78716C]">This action cannot be undone.</p>
                            </div>
                        </div>

                        <p className="mt-4 text-xs text-[#78716C] leading-relaxed">
                            Are you sure you want to permanently delete{" "}
                            <strong className="text-[#1C1917]">{userToDelete.display_name}</strong> (
                            <span className="font-mono text-[#78716C]">{userToDelete.email}</span>)? Active sessions will be terminated immediately.
                        </p>

                        <div className="mt-6 flex items-center justify-end gap-2 border-t border-[#E8E3DB] pt-4">
                            <button
                                type="button"
                                onClick={() => setUserToDelete(null)}
                                className="rounded-xl border border-[#E8E3DB] bg-white px-4 py-2 text-xs font-semibold text-[#78716C] hover:bg-[#FAF8F5] hover:text-[#1C1917] cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteUser}
                                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 cursor-pointer active:scale-98"
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
