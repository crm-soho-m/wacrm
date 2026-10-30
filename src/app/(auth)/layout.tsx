import type { Metadata } from "next";
import type { ReactNode } from "react";

// Shared metadata for auth pages (login / signup / forgot-password).
// None of these should be indexed — they'd compete with the marketing
// landing in SERPs and offer nothing to a searcher who hasn't already
// signed up. Each page still gets its own <title> via its own
// metadata.title override below the route group layout.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col gap-3 bg-background p-3 lg:flex-row">
      <aside className="flex shrink-0 flex-col justify-between gap-6 rounded-[2rem] bg-primary p-6 text-primary-foreground lg:w-[46%] lg:gap-12 lg:p-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-soho.png"
          alt="SohoM"
          className="h-10 w-auto self-start rounded-xl lg:h-14"
        />
        <div className="hidden flex-col gap-5 lg:flex">
          <h1 className="text-5xl leading-[1.05] font-light tracking-tight">
            Seus clientes do WhatsApp, <b className="font-bold">num só lugar.</b>
          </h1>
          <p className="max-w-md text-base leading-relaxed">
            Organize contatos, conversas e vendas e veja de onde vêm os seus
            clientes.
          </p>
        </div>
        <div className="hidden flex-wrap gap-2 lg:flex">
          {["Contatos", "Funil de vendas", "Origem dos leads"].map((t) => (
            <span
              key={t}
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white"
            >
              {t}
            </span>
          ))}
        </div>
      </aside>
      <div className="flex flex-1 items-center justify-center rounded-[2rem] bg-card">
        {children}
      </div>
    </div>
  );
}
