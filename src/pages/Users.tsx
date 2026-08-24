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
  const [emails, setEmails] = useState<Record<number, string>>({});
  const [phones, setPhones] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [reset, setReset] = useState<{ name: string; username: string; tempPassword: string } | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    const data = await api<{ users: PublicUser[] }>("/api/users");
    setUsers(data.users);
    const nextEmails: Record<number, string> = {};
    const nextPhones: Record<number, string> = {};
    for (const user of data.users) {
      nextEmails[user.id] = user.email ?? "";
      nextPhones[user.id] = user.phone ?? "";
    }
    setEmails(nextEmails);
    setPhones(nextPhones);
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

  async function saveContact(user: PublicUser) {
    setError("");
    setSaved("");
    setSavingId(user.id);
    try {
      await api(`/api/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ email: emails[user.id] ?? "", phone: phones[user.id] ?? "" }),
      });
      setSaved(`Saved contact info for ${user.name}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact info");
    } finally {
      setSavingId(null);
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
          Add a phone number to text someone when it is their turn. Email is optional. In-app notices always appear after they log in.
        </p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{saved}</p>}
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
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const emailDraft = emails[u.id] ?? "";
              const phoneDraft = phones[u.id] ?? "";
              const changed = emailDraft.trim() !== (u.email ?? "") || phoneDraft.trim() !== (u.phone ?? "");
              return (
                <tr key={u.id} className="border-t align-top">
                  <td className="px-3 py-2">{u.seniority ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{u.name}</td>
                  <td className="px-3 py-2 font-mono">{u.username}</td>
                  <td className="px-3 py-2">
                    <input
                      className="min-w-44 w-full rounded-md border px-2 py-1"
                      placeholder="name@example.com"
                      value={emailDraft}
                      onChange={(e) => setEmails((all) => ({ ...all, [u.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="min-w-36 w-full rounded-md border px-2 py-1"
                      placeholder="555-123-4567"
                      value={phoneDraft}
                      onChange={(e) => setPhones((all) => ({ ...all, [u.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveContact(u);
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">{roleLabel(u)}</td>
                  <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={!changed || savingId === u.id}
                      className="text-navy underline disabled:text-slate-400"
                      onClick={() => saveContact(u)}
                    >
                      {savingId === u.id ? "Saving" : "Save"}
                    </button>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
