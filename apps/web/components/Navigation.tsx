"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const ITEMS = [
  { href: "/matches", label: "Matches", icon: "✨" },
  { href: "/chats", label: "Chats", icon: "💬" },
  { href: "/onboarding", label: "Me", icon: "🌱" },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-[#e4e9e5] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
      <div className="mx-auto flex max-w-[980px] items-center justify-between gap-1 px-2 py-1.5 sm:px-3">
        <div className="flex flex-1 gap-1 sm:flex-none">
          {ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold sm:flex-row sm:gap-1.5 sm:py-2 sm:text-sm ${
                  active ? "bg-[#e8f4ed] text-[#205942]" : "text-slate-600"
                }`}
              >
                <span aria-hidden className="text-lg leading-none sm:text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
        <button className="whitespace-nowrap rounded-xl px-3 py-2 text-xs text-slate-500 sm:text-sm" onClick={logout}>Log out</button>
      </div>
    </nav>
  );
}
