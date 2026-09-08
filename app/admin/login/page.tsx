"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { apiFetch } from "@/lib/client-api";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch<{ ok: boolean }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      const nextPath = new URLSearchParams(window.location.search).get("next");
      window.location.replace(nextPath?.startsWith("/admin") ? nextPath : "/admin");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login gagal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-stone-100 via-white to-orange-50 p-5">
      <section className="card w-full max-w-md p-7">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-xl bg-brand-600 p-3 text-white"><LockKeyhole /></span>
          <div>
            <h1 className="text-xl font-bold">Login Admin</h1>
            <p className="text-xs text-stone-500">Gunakan akun tunggal dari file environment.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label><span className="label">Username</span><input className="field" name="username" autoComplete="username" required /></label>
          <label><span className="label">Password</span><input className="field" type="password" name="password" autoComplete="current-password" required /></label>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={loading}>{loading ? "Memeriksa…" : "Masuk ke Admin"}</button>
        </form>
        <p className="mt-5 text-center text-xs text-stone-500">Kredensial tidak disimpan di browser dan sesi berakhir setelah 8 jam.</p>
      </section>
    </main>
  );
}
