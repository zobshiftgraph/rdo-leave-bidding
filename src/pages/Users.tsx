import { useEffect, useState } from "react";
import { api } from "../api";
import type { PublicUser } from "../types";

function roleLabel(user: PublicUser) {
  const parts = [];
  if (user.role === "admin") parts.push("Admin");
  if (user.seniority != null) parts.push("bidder");
  return parts.join(" · ") || "Account";
}

export default function Users({ currentUser }: { currentUser: PublicUser }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [reset, setReset] = useState<{ name: string; username: string; tempPassword: string } | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ users: PublicUser[] }>("/api/users");
    setUsers(data.users);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, []);

  async function toggleAdmin(user: PublicUser) {
    setError("");
    try {
      await api(`/api/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: user.role === "admin" ? "bidder" : "admin" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role");
    }
  }

  async function resetPassword(id: number) {
    const data = await api<{ name: string; username: string; tempPassword: string }>(`/api/users/${id}/reset-password`, {
      method: "POST",
    });
    setReset(data);
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Users</h1>
        <p className="text-sm text-slate-600">
          Admin controls the bid. Anyone on the seniority roster can bid, including admins. Put yourself on the roster to bid.
        </p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {reset && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">
          Temporary password for {reset.name} ({reset.username}): <strong className="font-mono">{reset.tempPassword}</strong>
        </p>
      )}
      <div className="overflow-auto rounded-xl border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">{u.seniority ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 font-mono">{u.username}</td>
                <td className="px-3 py-2">{u.email || "—"}</td>
                <td className="px-3 py-2">{roleLabel(u)}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  {u.id === currentUser.id ? (
                    <span className="text-slate-400">You</span>
                  ) : (
                    <button type="button" className="text-navy underline" onClick={() => toggleAdmin(u)}>
                      {u.role === "admin" ? "Remove admin" : "Grant admin"}
                    </button>
                  )}
                  <button type="button" className="text-navy underline" onClick={() => resetPassword(u.id)}>
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
