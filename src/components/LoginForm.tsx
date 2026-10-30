"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "./Shell";
import { Notice, Spinner } from "./bits";
import { api } from "@/lib/ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await api<{ user: { mustChangePassword?: boolean } }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      router.push(r.user.mustChangePassword ? "/settings?changePassword=1" : "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="card rise w-full max-w-sm space-y-4 p-6">
        <Logo className="text-lg" />
        <div>
          <h1 className="display text-2xl">เข้าสู่ระบบ</h1>
          <p className="mt-1 text-sm text-mist">ใช้บัญชีที่ผู้ดูแลสร้างให้</p>
        </div>
        {error && <Notice>{error}</Notice>}
        <div>
          <label className="label" htmlFor="email">อีเมล</label>
          <input id="email" className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">รหัสผ่าน</label>
          <input id="password" className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-lime w-full" disabled={busy}>{busy ? <Spinner /> : "เข้าสู่ระบบ"}</button>
      </form>
    </div>
  );
}
