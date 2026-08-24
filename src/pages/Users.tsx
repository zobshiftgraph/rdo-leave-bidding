import { useEffect, useState } from "react";
import { api } from "../api";
import type { PublicUser } from "../types";

type IssuedLogin = { name: string; username: string; tempPassword: string };

function roleLabel(user: PublicUser) {
  const parts = [];
  if (user.role === "admin") parts.push("Admin");
  if (user.seniority != null) parts.push("bidder");
  return parts.join(" · ") || "Account";
}

function downloadLogins(rows: IssuedLogin[]) {
  const lines = ["name,username,temporary_password"];
  for (const row of rows) {
    lines.push(`"${row.name.replaceAll('"', '""')}",${row.username},${row.tempPassword}`);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "first-login-passwords.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Users({ currentUser }: { currentUser: PublicUser }) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [emails, setEmails] = useState<Record<number, string>>({});
  const [phones, setPhones] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [issued, setIssued] = useState<IssuedLogin[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

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

  const pending = users.filter((u) => u.must_change_password && u.id !== currentUser.id);

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
    setError("");
    try {
      const data = await api<IssuedLogin>(`/api/users/${id}/reset-password`, {
        method: "POST",
      });
      setIssued((all) => {
        const rest = all.filter((row) => row.username !== data.username);
        return [data, ...rest];
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a password");
    }
  }

  async function issuePending() {
    if (
      !confirm(
        `Create new first-time passwords for ${pending.length} people who have not signed in yet? Anyone who already logged in is not changed.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<{ issued: IssuedLogin[] }>("/api/users/issue-passwords", { method: "POST" });
      setIssued(data.issued);
      if (data.issued.length) {
        downloadLogins(data.issued);
      } else {
        setSaved("No unused first-time logins to create. People who already signed in keep their current password.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create passwords");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Users</h1>
          <p className="text-sm text-slate-600">
            First-time passwords are not stored after import. Use <strong>New password</strong> for one person, or create a list for everyone who has not logged in yet.
          </p>
        </div>
        {pending.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={issuePending}
            className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
          >
            {busy ? "Creating…" : `Create first-time passwords (${pending.length})`}
          </button>
        )}
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{saved}</p>}
      {issued.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-amber-950">Give these out now. They will not be shown again.</p>
            <button type="button" className="text-sm text-navy underline" onClick={() => downloadLogins(issued)}>
              Download CSV
            </button>
          </div>
          <div className="overflow-auto rounded-md bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Temporary password</th>
                </tr>
              </thead>
              <tbody>
                {issued.map((row) => (
                  <tr key={row.username} className="border-t">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 font-mono">{row.username}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{row.tempPassword}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
              <th className="px-3 py-2">Login</th>
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
                  <td className="px-3 py-2">
                    {u.must_change_password ? (
                      <span className="text-amber-800">Needs first login</span>
                    ) : (
                      <span className="text-slate-500">Signed in</span>
                    )}
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
                      New password
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
