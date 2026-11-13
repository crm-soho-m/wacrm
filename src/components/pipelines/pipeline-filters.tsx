"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Deal, Tag } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// ============================================================
// Pesquisa e filtros do funil (SohoM).
// Os negócios do funil já vêm todos carregados na página, então a
// filtragem acontece aqui no navegador, sem consultas extras — só as
// etiquetas dos contatos são buscadas à parte.
// ============================================================

export interface DealFilters {
  search: string;
  assignedTo: string; // "" = todos, "__none" = sem responsável
  status: string; // "" | "open" | "won" | "lost"
  source: string; // "" | valor | "__none"
  utmSource: string;
  utmCampaign: string;
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  tagId: string;
}

export const EMPTY_DEAL_FILTERS: DealFilters = {
  search: "",
  assignedTo: "",
  status: "",
  source: "",
  utmSource: "",
  utmCampaign: "",
  from: "",
  to: "",
  tagId: "",
};

const NONE = "__none";

function normalize(v: string | null | undefined): string {
  return (v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matchOptional(value: string | null | undefined, filter: string) {
  if (!filter) return true;
  if (filter === NONE) return !value;
  return value === filter;
}

/** Contato → ids das etiquetas, para os negócios carregados. */
export function useContactTags(deals: Deal[]) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [contactTags, setContactTags] = useState<Record<string, string[]>>({});

  const contactIdsKey = useMemo(
    () =>
      Array.from(
        new Set(deals.map((d) => d.contact_id).filter((id): id is string => !!id)),
      )
        .sort()
        .join(","),
    [deals],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const ids = contactIdsKey ? contactIdsKey.split(",") : [];
      const [tagsRes, ctRes] = await Promise.all([
        supabase.from("tags").select("*").order("name"),
        ids.length
          ? supabase.from("contact_tags").select("contact_id, tag_id").in("contact_id", ids)
          : Promise.resolve({ data: [] as { contact_id: string; tag_id: string }[] }),
      ]);
      if (cancelled) return;
      setTags((tagsRes.data ?? []) as Tag[]);
      const map: Record<string, string[]> = {};
      for (const row of (ctRes.data ?? []) as { contact_id: string; tag_id: string }[]) {
        (map[row.contact_id] ??= []).push(row.tag_id);
      }
      setContactTags(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactIdsKey]);

  return { tags, contactTags };
}

export function applyDealFilters(
  deals: Deal[],
  f: DealFilters,
  contactTags: Record<string, string[]>,
): Deal[] {
  const q = normalize(f.search.trim());
  const fromTs = f.from ? new Date(`${f.from}T00:00:00`).getTime() : null;
  const toTs = f.to ? new Date(`${f.to}T23:59:59.999`).getTime() : null;

  return deals.filter((d) => {
    if (q) {
      const haystack = normalize(
        [d.title, d.contact?.name, d.contact?.phone, d.contact?.company, d.contact?.email]
          .filter(Boolean)
          .join(" "),
      );
      if (!haystack.includes(q)) return false;
    }
    if (!matchOptional(d.assigned_to, f.assignedTo)) return false;
    if (f.status && (d.status ?? "open") !== f.status) return false;
    if (!matchOptional(d.source, f.source)) return false;
    if (!matchOptional(d.utm_source, f.utmSource)) return false;
    if (!matchOptional(d.utm_campaign, f.utmCampaign)) return false;
    if (fromTs !== null || toTs !== null) {
      const ts = new Date(d.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
    }
    if (f.tagId) {
      const ids = d.contact_id ? contactTags[d.contact_id] ?? [] : [];
      if (!ids.includes(f.tagId)) return false;
    }
    return true;
  });
}

function distinct(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

interface PipelineFiltersProps {
  deals: Deal[];
  tags: Tag[];
  filters: DealFilters;
  onChange: (f: DealFilters) => void;
  shownCount: number;
}

const selectClass =
  "h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary";

export function PipelineFilters({
  deals,
  tags,
  filters,
  onChange,
  shownCount,
}: PipelineFiltersProps) {
  const t = useTranslations("Pipelines.filters");
  const [open, setOpen] = useState(false);

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of deals) {
      if (d.assigned_to) {
        map.set(d.assigned_to, d.assignee?.full_name || d.assignee?.email || "—");
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [deals]);
  const sources = useMemo(() => distinct(deals.map((d) => d.source)), [deals]);
  const utmSources = useMemo(() => distinct(deals.map((d) => d.utm_source)), [deals]);
  const utmCampaigns = useMemo(() => distinct(deals.map((d) => d.utm_campaign)), [deals]);

  const activeCount = (
    ["assignedTo", "status", "source", "utmSource", "utmCampaign", "from", "to", "tagId"] as const
  ).filter((k) => filters[k]).length;
  const anyActive = activeCount > 0 || filters.search.trim() !== "";

  const set = (patch: Partial<DealFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder={t("searchPlaceholder")}
            className="h-9 rounded-2xl border-border bg-card pl-9 text-foreground"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "h-9 rounded-2xl border-border bg-card text-foreground hover:bg-muted",
            open && "bg-muted",
          )}
        >
          <SlidersHorizontal className="mr-1 h-4 w-4" />
          {t("filters")}
          {activeCount > 0 && (
            <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
        {anyActive && (
          <>
            <Button
              variant="ghost"
              onClick={() => onChange(EMPTY_DEAL_FILTERS)}
              className="h-9 rounded-2xl text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-4 w-4" />
              {t("clear")}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t("showing", { shown: shownCount, total: deals.length })}
            </span>
          </>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("assignedTo")}
            <select
              value={filters.assignedTo}
              onChange={(e) => set({ assignedTo: e.target.value })}
              className={selectClass}
            >
              <option value="">{t("all")}</option>
              <option value={NONE}>{t("unassigned")}</option>
              {assignees.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("status")}
            <select
              value={filters.status}
              onChange={(e) => set({ status: e.target.value })}
              className={selectClass}
            >
              <option value="">{t("all")}</option>
              <option value="open">{t("statusOpen")}</option>
              <option value="won">{t("statusWon")}</option>
              <option value="lost">{t("statusLost")}</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("source")}
            <select
              value={filters.source}
              onChange={(e) => set({ source: e.target.value })}
              className={selectClass}
            >
              <option value="">{t("all")}</option>
              <option value={NONE}>{t("noValue")}</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("tag")}
            <select
              value={filters.tagId}
              onChange={(e) => set({ tagId: e.target.value })}
              className={selectClass}
            >
              <option value="">{t("all")}</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("utmSource")}
            <select
              value={filters.utmSource}
              onChange={(e) => set({ utmSource: e.target.value })}
              className={selectClass}
            >
              <option value="">{t("all")}</option>
              <option value={NONE}>{t("noValue")}</option>
              {utmSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("utmCampaign")}
            <select
              value={filters.utmCampaign}
              onChange={(e) => set({ utmCampaign: e.target.value })}
              className={selectClass}
            >
              <option value="">{t("all")}</option>
              <option value={NONE}>{t("noValue")}</option>
              {utmCampaigns.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("from")}
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => set({ from: e.target.value })}
              className="h-9 border-border bg-muted text-foreground"
            />
          </label>

          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {t("to")}
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => set({ to: e.target.value })}
              className="h-9 border-border bg-muted text-foreground"
            />
          </label>
        </div>
      )}
    </div>
  );
}
