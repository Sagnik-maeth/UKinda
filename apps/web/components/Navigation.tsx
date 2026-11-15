"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const items = [
    { href: "/matches", label: "Matches", icon: "✨" },
    { href: "/chats", label: "Chats", icon: "💬" },
    { href: "/onboarding", label: "My profile", icon: "🌱" },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-[#e4e9e5] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[980px] items-center justify-between px-3 py-2">
        <div className="flex gap-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${pathname.startsWith(item.href) ? "bg-[#e8f4ed] text-[#205942]" : "text-slate-600"}`}
            >
              <span className="mr-1">{item.icon}</span>{item.label}
            </Link>
          ))}
        </div>
        <button className="px-3 py-2 text-sm text-slate-500" onClick={logout}>Log out</button>
      </div>
    </nav>
  );
}
