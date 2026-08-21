import { useState } from "react";
import { api } from "../api";

interface PreviewRow {
  seniority: number;
  name: string;
  email?: string;
  employee_number?: string;
}

interface ImportResult {
  created: { name: string; username: string; tempPassword: string; seniority: number }[];
  updated: string[];
  total: number;
}

export default function Roster() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await api<{ rows: PreviewRow[] }>("/api/roster/preview", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not parse roster");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const data = await api<ImportResult>("/api/roster/import", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!result) return;
    const lines = ["seniority,name,username,temporary_password"];
    for (const row of result.created) {
      lines.push(`${row.seniority},"${row.name}",${row.username},${row.tempPassword}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster-logins.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Seniority roster</h1>
        <p className="text-slate-600">
          Paste the roster. Order in the paste (or a seniority column) is the order people bid RDOs and leave.
        </p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <textarea
        className="h-48 w-full rounded-xl border border-slate-300 p-3 font-mono text-sm"
        placeholder={"1\tAlex Rivera\talex@facility.gov\n2\tJordan Lee\tjordan@facility.gov\n3\tSam Patel"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="button" onClick={preview} disabled={busy} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium">
          Preview
        </button>
        <button type="button" onClick={save} disabled={busy || !text.trim()} className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">
          Save roster
        </button>
      </div>
      {rows.length > 0 && !result && (
        <div className="overflow-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Employee #</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.seniority}-${r.name}`} className="border-t">
                  <td className="px-3 py-2">{r.seniority}</td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.email || "—"}</td>
                  <td className="px-3 py-2">{r.employee_number || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-medium text-emerald-900">
            Imported {result.total} people ({result.created.length} new accounts, {result.updated.length} updated).
          </p>
          {result.created.length > 0 && (
            <>
              <p className="mt-2 text-sm">Give each person their username and temporary password. They will be asked to change it on first login.</p>
              <button type="button" onClick={downloadCsv} className="mt-3 rounded-md bg-navy px-3 py-1.5 text-sm text-white">
                Download login CSV
              </button>
              <div className="mt-3 overflow-auto rounded-md bg-white">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-slate-500">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Username</th>
                      <th className="px-3 py-2">Temp password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.created.map((r) => (
                      <tr key={r.username} className="border-t">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 font-mono">{r.username}</td>
                        <td className="px-3 py-2 font-mono">{r.tempPassword}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
