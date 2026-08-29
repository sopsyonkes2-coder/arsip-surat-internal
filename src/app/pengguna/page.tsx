"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";

type Role = "Admin" | "Operator" | "Tamu";

type User = {
  id: string;
  nama: string;
  nrp: string;
  username: string;
  role: Role;
  status: "Aktif" | "Nonaktif";
};

type UsersResponse = {
  success?: boolean;
  data?: User[];
  message?: string;
};

type FormState = {
  id?: string;
  nama: string;
  nrp: string;
  username: string;
  password: string;
  role: "Admin" | "Operator" | "Tamu";
  status: "Aktif" | "Nonaktif";
};

const blankForm: FormState = {
  nama: "",
  nrp: "",
  username: "",
  password: "",
  role: "Tamu",
  status: "Aktif",
};

export default function PenggunaPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(blankForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadUsers = async () => {
    const response = await fetch("/api/users", {
      cache: "no-store",
    });

    const result = (await response.json()) as UsersResponse;

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Gagal mengambil data pengguna."
      );
    }

    setUsers(result.data || []);
  };

  useEffect(() => {
    let active = true;

    void Promise.resolve()
      .then(() => loadUsers())
      .catch((requestError: unknown) => {
        if (!active) return;

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Gagal terhubung ke server."
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const saveUser = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/users", {
        method: form.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const result =
        (await response.json()) as UsersResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Gagal menyimpan pengguna."
        );
      }

      setFormOpen(false);
      setForm(blankForm);

      await loadUsers();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menyimpan pengguna."
      );
    } finally {
      setSaving(false);
    }
  };

  const editUser = (user: User) => {
    setForm({
      id: user.id,
      nama: user.nama,
      nrp: user.nrp,
      username: user.username,
      password: "",
      role: user.role,
      status: user.status,
    });

    setFormOpen(true);
    setError("");
  };

  const toggleUser = async (user: User) => {
    setError("");

    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...user,
          status:
            user.status === "Aktif"
              ? "Nonaktif"
              : "Aktif",
        }),
      });

      const result =
        (await response.json()) as UsersResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Gagal mengubah status pengguna."
        );
      }

      await loadUsers();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal mengubah status pengguna."
      );
    }
  };

  const deleteUser = async (user: User) => {
    if (
      !window.confirm(
        `Hapus pengguna ${user.username}?`
      )
    ) {
      return;
    }

    setError("");

    try {
      const response = await fetch(
        `/api/users?id=${encodeURIComponent(
          user.id
        )}`,
        {
          method: "DELETE",
        }
      );

      const result =
        (await response.json()) as UsersResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Gagal menghapus pengguna."
        );
      }

      await loadUsers();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Gagal menghapus pengguna."
      );
    }
  };

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter((user) =>
      [
        user.nama,
        user.nrp,
        user.username,
        user.role,
        user.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, users]);

  const totalUsers = users.length;

  const activeUsers = users.filter(
    (user) => user.status === "Aktif"
  ).length;

  const adminUsers = users.filter(
    (user) =>
      user.role === "Admin" ||
      user.role === "Operator"
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* HEADER */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">
            Manajemen
          </p>

          <h1 className="mt-1 text-2xl font-bold text-slate-900 md:text-3xl">
            Pengguna
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Kelola akun dan hak akses pengguna aplikasi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setForm(blankForm);
            setError("");
            setFormOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <Plus size={18} />
          Tambah Pengguna
        </button>
      </section>

      {/* ERROR */}
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {/* STATISTIK */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Total Pengguna
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {totalUsers}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Pengguna Aktif
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {activeUsers}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Admin & Operator
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {adminUsers}
          </p>
        </div>
      </section>

      {/* TABEL */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* SEARCH */}
        <div className="border-b border-slate-200 p-5">
          <div className="relative max-w-lg">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Cari nama, NRP, username, atau role..."
              className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* LOADING */}
        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-500">
            <Loader2
              size={22}
              className="animate-spin text-blue-600"
            />

            Memuat pengguna...
          </div>
        ) : filteredUsers.length === 0 ? (
          /* EMPTY */
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <Users
              size={32}
              className="text-slate-300"
            />

            <p className="mt-3 text-sm font-medium text-slate-700">
              Data pengguna tidak ditemukan.
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Pastikan endpoint pengguna dan
              konfigurasinya tersedia.
            </p>
          </div>
        ) : (
          /* TABLE */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">
                    Nama
                  </th>

                  <th className="px-5 py-4">
                    NRP
                  </th>

                  <th className="px-5 py-4">
                    Username
                  </th>

                  <th className="px-5 py-4">
                    Role
                  </th>

                  <th className="px-5 py-4">
                    Status
                  </th>

                  <th className="px-5 py-4">
                    Aksi
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="transition hover:bg-slate-50"
                  >
                    {/* NAMA */}
                    <td className="px-5 py-4 font-medium text-slate-800">
                      {user.nama}
                    </td>

                    {/* NRP */}
                    <td className="px-5 py-4 text-slate-600">
                      {user.nrp || "-"}
                    </td>

                    {/* USERNAME */}
                    <td className="px-5 py-4 text-slate-600">
                      {user.username}
                    </td>

                    {/* ROLE */}
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          user.role === "Admin"
                            ? "bg-blue-100 text-blue-700"
                            : user.role ===
                              "Operator"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>

                    {/* STATUS */}
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          user.status === "Aktif"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>

                    {/* AKSI */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            editUser(user)
                          }
                          title="Edit pengguna"
                          className="text-blue-600 transition hover:text-blue-800"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void toggleUser(user)
                          }
                          className="text-xs font-medium text-slate-500 transition hover:text-slate-800"
                        >
                          {user.status ===
                          "Aktif"
                            ? "Nonaktifkan"
                            : "Aktifkan"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void deleteUser(user)
                          }
                          title="Hapus pengguna"
                          className="text-red-600 transition hover:text-red-800"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* MODAL TAMBAH / EDIT */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={saveUser}
            className="w-full max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-xl"
          >
            {/* JUDUL */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {form.id
                  ? "Edit Pengguna"
                  : "Tambah Pengguna"}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Masukkan data pengguna dan hak aksesnya.
              </p>
            </div>

            {/* FORM */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* NAMA */}
              <input
                required
                placeholder="Nama"
                value={form.nama}
                onChange={(event) =>
                  setForm({
                    ...form,
                    nama: event.target.value,
                  })
                }
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              {/* NRP */}
              <input
                placeholder="NRP"
                value={form.nrp}
                onChange={(event) =>
                  setForm({
                    ...form,
                    nrp: event.target.value,
                  })
                }
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              {/* USERNAME */}
              <input
                required
                placeholder="Username"
                value={form.username}
                onChange={(event) =>
                  setForm({
                    ...form,
                    username: event.target.value,
                  })
                }
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              {/* PASSWORD */}
              <input
                required={!form.id}
                type="password"
                placeholder={
                  form.id
                    ? "Password baru (opsional)"
                    : "Password"
                }
                value={form.password}
                onChange={(event) =>
                  setForm({
                    ...form,
                    password: event.target.value,
                  })
                }
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              {/* ROLE */}
<select
  value={form.role}
  onChange={(event) =>
    setForm({
      ...form,
      role: event.target.value as FormState["role"],
    })
  }
  className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
>
  <option value="Admin">Admin</option>
  <option value="Operator">Operator</option>
  <option value="Tamu">Tamu</option>
</select>

              {/* STATUS */}
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target
                      .value as FormState["status"],
                  })
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="Aktif">
                  Aktif
                </option>

                <option value="Nonaktif">
                  Nonaktif
                </option>
              </select>
            </div>

            {/* ERROR MODAL */}
            {error && (
              <p className="text-sm text-red-600">
                {error}
              </p>
            )}

            {/* BUTTON */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setError("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                )}

                {saving
                  ? "Menyimpan..."
                  : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}