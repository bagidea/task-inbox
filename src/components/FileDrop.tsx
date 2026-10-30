"use client";
import { useRef, useState } from "react";
import { fmtSize } from "@/lib/export";

/** A drop zone + picker; keeps the chosen files in the parent's state. */
export function FileDrop({ files, onChange, accept, hint = "ลากไฟล์มาวาง หรือแตะเพื่อเลือก (รูป, zip, md, pdf, … ไม่เกิน 30 MB ต่อไฟล์)" }: { files: File[]; onChange: (f: File[]) => void; accept?: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    onChange(next);
  };
  return (
    <div>
      <div
        className={`dropzone ${over ? "dropzone-over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
      >
        <div className="text-sm">{hint}</div>
        <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 rounded-lg bg-ink-3 px-3 py-1.5 text-sm">
              <span className="truncate">{f.name}</span>
              <span className="text-xs text-mist">{fmtSize(f.size)}</span>
              <button type="button" className="ml-auto text-xs text-mist hover:text-coral" onClick={() => onChange(files.filter((x) => x !== f))}>ลบ</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
