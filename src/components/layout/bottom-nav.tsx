"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, MessageSquare, Users, GitBranch, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

// Barra de navegação inferior — só no celular/tablet (some em lg+, onde
// a barra lateral já aparece). Os 4 destinos mais usados + "Menu", que
// abre a gaveta com todas as outras telas.
const items = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
  { href: "/contacts", labelKey: "contacts", icon: Users },
  { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
] as const;

export function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between rounded-full bg-card px-2 py-2 shadow-lg ring-1 ring-border lg:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map(({ href, labelKey, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] font-semibold transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate">{t(labelKey)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-1 py-1.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
        <span>{t("menu")}</span>
      </button>
    </nav>
  );
}
