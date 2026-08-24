import { useState, type FormEvent } from "react";
import { api } from "../api";
import type { PublicUser } from "../types";

export default function Account({ user, onUpdated }: { user: PublicUser; onUpdated: (user: PublicUser) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState(user.email ?? "");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    try {
      const data = await api<{ email: string | null }>("/api/me/email", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setDone("Email saved.");
      onUpdated({ ...user, email: data.email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save email");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await api("/api/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, password }),
      });
      setDone("Password updated.");
      onUpdated({ ...user, must_change_password: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold text-navy">Account</h1>
      {user.must_change_password && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">Please choose a new password before using the app.</p>
      )}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
      <div className="rounded-xl border bg-white p-4 text-sm shadow-sm">
        <div>
          <strong>{user.name}</strong>
        </div>
        <div>Username: {user.username}</div>
        {user.seniority && <div>Seniority: #{user.seniority}</div>}
      </div>
      <form onSubmit={saveEmail} className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium">
          Email (for turn notifications)
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </label>
        <button type="submit" className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">
          Save email
        </button>
      </form>
      <form onSubmit={submit} className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        {!user.must_change_password && (
          <label className="block text-sm font-medium">
            Current password
            <input type="password" className="mt-1 w-full rounded-md border px-3 py-2" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
        )}
        <label className="block text-sm font-medium">
          New password
          <input type="password" minLength={8} required className="mt-1 w-full rounded-md border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Confirm new password
          <input type="password" required className="mt-1 w-full rounded-md border px-3 py-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button type="submit" className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">
          Save password
        </button>
      </form>
    </div>
  );
}
