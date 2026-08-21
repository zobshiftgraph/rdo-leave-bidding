import { useState, type FormEvent } from "react";
import { api } from "../api";

export default function Setup({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/bootstrap", {
        method: "POST",
        body: JSON.stringify({ name, username, email, password }),
      });
      onCreated();
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-4">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-navy">Set up the bidding app</h1>
        <p className="mt-2 text-sm text-slate-600">
          Create the first admin account. After this you can paste the seniority roster and open RDO and leave bidding.
        </p>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium">
            Your name
            <input className="mt-1 w-full rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium">
            Admin username
            <input className="mt-1 w-full rounded-md border px-3 py-2" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="block text-sm font-medium">
            Email (for turn notifications)
            <input type="email" className="mt-1 w-full rounded-md border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            Password (8+ characters)
            <input type="password" className="mt-1 w-full rounded-md border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
        </div>
        <button type="submit" disabled={busy} className="mt-5 w-full rounded-md bg-navy py-2.5 font-medium text-white hover:bg-navy-dark">
          {busy ? "Creating…" : "Create admin account"}
        </button>
      </form>
    </div>
  );
}
