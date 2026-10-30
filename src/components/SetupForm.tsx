"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "./Shell";
import { Notice, Spinner } from "./bits";
import { api } from "@/lib/ui";

/** First run: the admin account, unlocked by the SETUP_CODE from the deploy. */
export function SetupForm() {
  const router = useRouter();
  const [f, setF] = useState({ code: "", name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/setup", { method: "POST", body: JSON.stringify(f) });
      router.push("/settings");
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
          <h1 className="display text-2xl">ตั้งค่าครั้งแรก</h1>
          <p className="mt-1 text-sm text-mist">สร้างบัญชีผู้ดูแลบัญชีแรก ใส่รหัสตั้งค่าจากตอน deploy</p>
        </div>
        {error && <Notice>{error}</Notice>}
        <div><label className="label">รหัสตั้งค่า</label><input className="field field-mono" value={f.code} onChange={set("code")} required autoComplete="off" /></div>
        <div><label className="label">ชื่อ</label><input className="field" value={f.name} onChange={set("name")} required /></div>
        <div><label className="label">อีเมล</label><input className="field" type="email" value={f.email} onChange={set("email")} required autoComplete="username" /></div>
        <div><label className="label">รหัสผ่าน (8 ตัวขึ้นไป)</label><input className="field" type="password" value={f.password} onChange={set("password")} required autoComplete="new-password" /></div>
        <button className="btn btn-lime w-full" disabled={busy}>{busy ? <Spinner /> : "สร้างบัญชีผู้ดูแล"}</button>
      </form>
    </div>
  );
}
