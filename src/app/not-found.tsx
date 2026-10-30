import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-10 text-center">
      <div>
        <div className="display text-5xl text-mist">404</div>
        <p className="mt-2 text-mist">ไม่พบหน้านี้หรืองานนี้</p>
        <Link href="/" className="btn btn-ghost mt-4">กลับหน้างาน</Link>
      </div>
    </div>
  );
}
