"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2, Users } from "lucide-react";

type User = {
	id: string;
	nama: string;
	nrp: string;
	username: string;
	role: "Super Admin" | "Admin" | "Tamu";
	status: "Aktif" | "Nonaktif";
};

type UsersResponse = {
	success?: boolean;
	data?: User[];
	message?: string;
};

type FormState = { id?: string; nama: string; nrp: string; username: string; password: string; role: "Admin" | "Tamu"; status: "Aktif" | "Nonaktif" };
const blankForm: FormState = { nama: "", nrp: "", username: "", password: "", role: "Tamu", status: "Aktif" };

export default function PenggunaPage() {
	const [users, setUsers] = useState<User[]>([]);
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [form, setForm] = useState<FormState>(blankForm);
	const [formOpen, setFormOpen] = useState(false);
	const [saving, setSaving] = useState(false);

	const loadUsers = async () => {
		const response = await fetch("/api/users", { cache: "no-store" });
		const result = (await response.json()) as UsersResponse;
		if (!response.ok || !result.success) throw new Error(result.message || "Gagal mengambil data pengguna.");
		setUsers(result.data || []);
	};

	useEffect(() => {
		let active = true;

		void Promise.resolve().then(() => loadUsers())
			.catch((requestError: unknown) => {
				if (!active) return;
				setError(
					requestError instanceof Error
						? requestError.message
						: "Gagal terhubung ke server."
				);
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, []);

	const saveUser = async (event: React.FormEvent) => {
		event.preventDefault(); setSaving(true); setError("");
		try {
			const response = await fetch("/api/users", { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
			const result = (await response.json()) as UsersResponse;
			if (!response.ok || !result.success) throw new Error(result.message || "Gagal menyimpan pengguna.");
			setFormOpen(false); setForm(blankForm); await loadUsers();
		} catch (requestError: unknown) { setError(requestError instanceof Error ? requestError.message : "Gagal menyimpan pengguna."); } finally { setSaving(false); }
	};

	const editUser = (user: User) => { setForm({ ...user, role: user.role === "Tamu" ? "Tamu" : "Admin", password: "" }); setFormOpen(true); };
	const toggleUser = async (user: User) => {
		try { const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...user, status: user.status === "Aktif" ? "Nonaktif" : "Aktif" }) }); if (!response.ok) throw new Error("Gagal mengubah status pengguna."); await loadUsers(); } catch (requestError: unknown) { setError(requestError instanceof Error ? requestError.message : "Gagal mengubah status pengguna."); }
	};

	const deleteUser = async (user: User) => {
		if (!window.confirm(`Hapus pengguna ${user.username}?`)) return;
		try { const response = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" }); const result = (await response.json()) as UsersResponse; if (!response.ok || !result.success) throw new Error(result.message || "Gagal menghapus pengguna."); await loadUsers(); } catch (requestError: unknown) { setError(requestError instanceof Error ? requestError.message : "Gagal menghapus pengguna."); }
	};

	const filteredUsers = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return users;

		return users.filter((user) =>
			[user.nama, user.nrp, user.username, user.role]
				.join(" ")
				.toLowerCase()
				.includes(query)
		);
	}, [search, users]);

	return (
		<div className="mx-auto max-w-7xl space-y-6">
			<section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-sm font-medium text-blue-600">Manajemen</p>
					<h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
						Pengguna
					</h1>
					<p className="mt-2 text-sm text-slate-500">
						Kelola akun dan hak akses pengguna aplikasi.
					</p>
				</div>
				<button
					type="button"
					onClick={() => { setForm(blankForm); setFormOpen(true); }}
					className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
				>
					<Plus size={18} /> Tambah Pengguna
				</button>
			</section>

			{error && (
				<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					{error}
				</div>
			)}

			<section className="grid gap-4 sm:grid-cols-3">
				{[
					["Total Pengguna", users.length],
					["Pengguna Aktif", users.filter((user) => user.status === "Aktif").length],
					["Administrator", users.filter((user) => user.role !== "Tamu").length],
				].map(([label, value]) => (
					<div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
						<p className="text-sm text-slate-500">{label}</p>
						<p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
					</div>
				))}
			</section>

			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="border-b border-slate-200 p-5">
					<div className="relative max-w-lg">
						<Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Cari nama, NRP, username, atau role..."
							className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
						/>
					</div>
				</div>

				{loading ? (
					<div className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-500">
						<Loader2 size={22} className="animate-spin text-blue-600" /> Memuat pengguna...
					</div>
				) : filteredUsers.length === 0 ? (
					<div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
						<Users size={32} className="text-slate-300" />
						<p className="mt-3 text-sm font-medium text-slate-700">Data pengguna tidak ditemukan.</p>
						<p className="mt-1 text-sm text-slate-400">Pastikan endpoint pengguna dan konfigurasinya tersedia.</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[700px] text-left text-sm">
							<thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
								<tr>
									<th className="px-5 py-4">Nama</th><th className="px-5 py-4">NRP</th><th className="px-5 py-4">Username</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Aksi</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{filteredUsers.map((user) => (
									<tr key={user.id}>
										<td className="px-5 py-4 font-medium text-slate-800">{user.nama}</td>
										<td className="px-5 py-4 text-slate-600">{user.nrp}</td>
										<td className="px-5 py-4 text-slate-600">{user.username}</td>
										<td className="px-5 py-4 text-slate-600">{user.role}</td>
										<td className="px-5 py-4 text-slate-600">{user.status}</td>
										<td className="px-5 py-4"><button type="button" onClick={() => editUser(user)} title="Edit pengguna" className="mr-2 text-blue-600"><Pencil size={16} /></button><button type="button" onClick={() => void toggleUser(user)} className="mr-2 text-xs text-slate-500">{user.status === "Aktif" ? "Nonaktifkan" : "Aktifkan"}</button><button type="button" onClick={() => void deleteUser(user)} title="Hapus pengguna" className="text-red-600"><Trash2 size={16} /></button></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
			{formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form onSubmit={saveUser} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-slate-900">{form.id ? "Edit Pengguna" : "Tambah Pengguna"}</h2><div className="grid gap-3 sm:grid-cols-2"><input required placeholder="Nama" value={form.nama} onChange={(event) => setForm({ ...form, nama: event.target.value })} className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><input placeholder="NRP" value={form.nrp} onChange={(event) => setForm({ ...form, nrp: event.target.value })} className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><input required placeholder="Username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><input required={!form.id} type="password" placeholder={form.id ? "Password baru (opsional)" : "Password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as FormState["role"] })} className="h-11 rounded-xl border border-slate-200 px-3 text-sm"><option>Admin</option><option>Tamu</option></select><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState["status"] })} className="h-11 rounded-xl border border-slate-200 px-3 text-sm"><option>Aktif</option><option>Nonaktif</option></select></div>{error && <p className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Batal</button><button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{saving ? "Menyimpan..." : "Simpan"}</button></div></form></div>}
		</div>
	);
}
