import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Search, TrendingDown, Sparkles, Plus, Check, RefreshCw, X, Merge, Link2, ChevronDown, ChevronUp } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  buildComparison,
  fetchFlyerProducts,
  fetchMarkets,
  brl,
  type ComparisonRow,
  type Market,
} from "@/lib/comparison";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EncarteSaqua — Compare encartes dos mercados de Saquarema" },
      { name: "description", content: "Compare em tempo real os preços dos encartes dos 3 maiores mercados de Saquarema e descubra onde comprar mais barato." },
    ],
  }),
  component: Index,
});

function Index() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<ComparisonRow | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);
  const [compact, setCompact] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { if (alive) setIsAdmin(false); return; }
      const { data } = await supabase.from("user_roles").select("role")
        .eq("user_id", sess.session.user.id).eq("role", "admin").maybeSingle();
      if (alive) setIsAdmin(!!data);
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const marketsQ = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets });
  const productsQ = useQuery({ queryKey: ["flyer_products"], queryFn: fetchFlyerProducts });

  const markets = marketsQ.data ?? [];
  const rows = useMemo(
    () => (markets.length && productsQ.data ? buildComparison(markets, productsQ.data) : []),
    [markets, productsQ.data]
  );

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))), [rows]);
  const filtered = rows.filter(
    (r) => (!category || r.category === category) && r.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalSavings = rows.reduce((acc, r) => acc + ((r.worstPrice ?? 0) - (r.bestPrice ?? 0)), 0);

  const lastSyncedAt = useMemo(() => {
    const dates = markets.map((m) => m.last_synced_at).filter((d): d is string => !!d).map((d) => new Date(d).getTime());
    return dates.length ? new Date(Math.max(...dates)) : null;
  }, [markets]);

  const refresh = async () => {
    setRefreshing(true);
    toast.info("Lendo os encartes com IA… isso leva ~1 minuto.");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Faça login como admin para atualizar.");
      const res = await fetch("/api/public/hooks/refresh-flyers", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Falha");
      const total = (data.results ?? []).reduce((a: number, r: { products?: number }) => a + (r.products ?? 0), 0);
      toast.success(`${total} produtos atualizados dos encartes.`);
      await queryClient.invalidateQueries({ queryKey: ["markets"] });
      await queryClient.invalidateQueries({ queryKey: ["flyer_products"] });
    } catch (err) {
      toast.error("Não foi possível atualizar os encartes agora.");
      console.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  const openMergeModal = (row: ComparisonRow) => { setMergeTarget(row); setMergeSearch(""); };

  const doMerge = async (source: ComparisonRow) => {
    if (!mergeTarget) return;
    setMerging(true);
    try {
      const { adminMergeProducts } = await import("@/lib/admin-merge-products.functions");
      await adminMergeProducts({
        data: { source_key: source.product_key, target_key: mergeTarget.product_key },
      });
      toast.success(`"${source.name}" unido a "${mergeTarget.name}".`);
      setMergeTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["flyer_products"] });
    } catch (err: any) {
      toast.error("Falha ao unir: " + (err?.message ?? "erro desconhecido"));
    } finally {
      setMerging(false);
    }
  };

  const mergeOptions = rows.filter(
    (r) => r.product_key !== mergeTarget?.product_key && r.name.toLowerCase().includes(mergeSearch.toLowerCase())
  );

  return (
    <div>
      {/* Merge Modal */}
      <Dialog open={!!mergeTarget} onOpenChange={(open) => !open && setMergeTarget(null)}>
        <DialogContent className="max-w-lg mx-4 sm:mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-4 w-4 text-primary" />
              Unir produto duplicado
            </DialogTitle>
            <DialogDescription>
              Produto canonical (será mantido):
              <span className="ml-1 font-semibold text-foreground">{mergeTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Busque o duplicado abaixo. Ao clicar em <strong>Unir</strong>, ele será removido.
          </p>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus placeholder="Buscar produto duplicado…" value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border divide-y">
            {mergeOptions.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum produto encontrado.</p>
            )}
            {mergeOptions.map((opt) => (
              <div key={opt.product_key} className="flex items-center gap-3 px-3 py-3 hover:bg-muted/40">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{opt.name}</div>
                  <div className="text-xs text-muted-foreground">{opt.category} • {opt.unit ?? "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums shrink-0">{opt.bestPrice ? brl(opt.bestPrice) : "—"}</div>
                <Button size="sm" variant="destructive" disabled={merging} onClick={() => doMerge(opt)}>
                  <Link2 className="h-3.5 w-3.5 mr-1" /> Unir
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ Esta ação é permanente.
          </div>
        </DialogContent>
      </Dialog>

      {/* Hero — compacto no mobile */}
      <section className="border-b bg-gradient-to-br from-accent/40 via-background to-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:py-14">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className="gap-1 bg-success/15 text-success hover:bg-success/15 text-xs">
              <Sparkles className="h-3 w-3" />
              {lastSyncedAt
                ? `Atualizado ${lastSyncedAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                : "Aguardando sincronização"}
            </Badge>
            <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing} className="gap-1.5 h-7 text-xs">
              <RefreshCw className={"h-3 w-3 " + (refreshing ? "animate-spin" : "")} />
              {refreshing ? "Atualizando…" : "Atualizar"}
            </Button>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-5xl leading-tight">
            Os encartes de Saquarema,{" "}
            <span className="text-primary">comparados lado a lado.</span>
          </h1>
          <p className="mt-2 text-sm sm:text-lg text-muted-foreground sm:mt-4 max-w-2xl">
            Veja qual mercado tem o melhor preço e monte sua lista inteligente.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {markets.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs sm:text-sm shadow-sm">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.logo_color }} />
                <span className="font-medium">{m.name}</span>
              </div>
            ))}
          </div>

          {/* Stats: 3 colunas no mobile também, menor */}
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4 sm:mt-8">
            <Stat label="Produtos" value={String(rows.length)} />
            <Stat label="Mercados" value={String(markets.length)} />
            <Stat label="Economia" value={brl(totalSavings)} accent />
          </div>
        </div>
      </section>

      {/* Filtros */}
      <section className="mx-auto max-w-6xl px-4 pt-4 pb-6 sm:py-8">
        {/* Busca */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar produto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 text-base sm:text-sm sm:h-10 sm:max-w-sm"
          />
        </div>

        {/* Categorias: scroll horizontal no mobile */}
        <div className="mt-3 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:flex-wrap">
            <CategoryPill active={category === null} onClick={() => setCategory(null)}>Todas</CategoryPill>
            {categories.map((c) => (
              <CategoryPill key={c} active={category === c} onClick={() => setCategory(c)}>{c}</CategoryPill>
            ))}
          </div>
        </div>

        {/* Modo compacto — apenas mobile */}
        <div className="mt-3 flex items-center justify-between sm:hidden">
          <span className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "produto" : "produtos"}
          </span>
          <button
            onClick={() => setCompact((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            {compact ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            {compact ? "Modo compacto" : "Modo detalhado"}
          </button>
        </div>

        {isAdmin && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <Merge className="h-3.5 w-3.5 shrink-0" />
            <span><strong>Modo admin:</strong> toque em <Merge className="inline h-3 w-3" /> para unir duplicados.</span>
          </div>
        )}

        {/* Cards — mobile: novo layout compacto; desktop: linha detalhada */}
        <div className="mt-4 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {productsQ.isLoading && (
            <div className="py-12 text-center text-muted-foreground text-sm sm:col-span-2 lg:col-span-3">Carregando encartes…</div>
          )}
          {!productsQ.isLoading && filtered.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm sm:col-span-2 lg:col-span-3">Nenhum produto encontrado.</div>
          )}

          {(() => {
            const compared = filtered.filter((r) => r.marketCount >= 2);
            const others = filtered.filter((r) => r.marketCount < 2);
            return (
              <>
                {compared.map((row) => (
                  <div key={row.product_key}>
                    <MobileCard row={row} markets={markets} isAdmin={isAdmin} onMerge={openMergeModal} compact={compact} />
                    <DesktopRow row={row} markets={markets} isAdmin={isAdmin} onMerge={openMergeModal} />
                  </div>
                ))}
                {others.length > 0 && (
                  <>
                    <div className="my-3 flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-2">Sem comparação</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    {others.map((row) => (
                      <div key={row.product_key}>
                        <MobileCard row={row} markets={markets} isAdmin={isAdmin} onMerge={openMergeModal} compact={compact} />
                        <DesktopRow row={row} markets={markets} isAdmin={isAdmin} onMerge={openMergeModal} />
                      </div>
                    ))}
                  </>
                )}
              </>
            );
          })()}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Quer salvar uma lista?{" "}
          <Link to="/auth" className="font-medium text-primary underline">Crie sua conta grátis</Link>.
        </p>
      </section>
    </div>
  );
}

/* ── Card mobile ── */
function MobileCard({ row, markets, isAdmin, onMerge, compact }: {
  row: ComparisonRow; markets: Market[]; isAdmin: boolean; onMerge: (r: ComparisonRow) => void; compact?: boolean;
}) {
  const [added, setAdded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const addToList = async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      toast.error("Faça login para salvar sua lista", {
        action: { label: "Entrar", onClick: () => (window.location.href = "/auth") },
      });
      return;
    }
    const { error } = await supabase.from("shopping_list_items").insert({
      user_id: sess.session.user.id, product_key: row.product_key, product_name: row.name, quantity: 1,
    });
    if (error) toast.error("Não foi possível adicionar");
    else {
      setAdded(true);
      toast.success(`${row.name} adicionado à lista`);
      setTimeout(() => setAdded(false), 1500);
    }
  };

  const bestMarket = markets.find((m) => m.slug === row.bestMarketSlug);

  return (
    <div className="mb-2.5 rounded-2xl border bg-card overflow-hidden shadow-[var(--shadow-card)] sm:hidden">
      {/* Cabeçalho: produto + melhor preço */}
      <div className={"px-3 " + (compact ? "py-2.5" : "py-3")}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="min-w-0">
            <div className={"font-medium leading-snug " + (compact ? "text-[13px]" : "text-sm")}>{row.name}</div>
            {!compact && (
              <div className="mt-0.5 text-xs text-muted-foreground">{row.category}{row.unit ? ` • ${row.unit}` : ""}</div>
            )}
          </div>

          {bestMarket && (
            <div className="shrink-0 text-right min-w-0">
              {!compact && <div className="text-[11px] leading-tight text-muted-foreground truncate max-w-[110px]">{bestMarket.name}</div>}
              <div className="flex items-center justify-end gap-1 text-success font-bold text-sm tabular-nums leading-tight">
                <TrendingDown className="h-3 w-3 shrink-0" />
                {brl(row.bestPrice!)}
              </div>
              {compact && (
                <div className="text-[10px] leading-none text-muted-foreground truncate max-w-[90px]">{bestMarket.name}</div>
              )}
            </div>
          )}
        </div>

        {/* Barra de ações — linha separada para nunca comprimir o nome */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {row.marketCount >= 2 ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border bg-muted/40 px-2 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted min-w-0"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{expanded ? "Ocultar preços" : "Ver preços dos mercados"}</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              Apenas um mercado
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {isAdmin && (
              <button onClick={() => onMerge(row)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-primary hover:bg-muted">
                <Merge className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={addToList}
              className={"grid h-8 w-8 place-items-center rounded-lg border transition " + (added ? "bg-success/10 border-success/30 text-success" : "bg-card text-muted-foreground hover:text-foreground")}
            >
              {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Preços expandidos — lista vertical, ordenada do menor para o maior */}
      {expanded && (
        <div className="border-t bg-muted/30 divide-y divide-border/60">
          {markets
            .map((m) => ({ m, price: row.prices[m.slug] }))
            .sort((a, b) => {
              if (a.price === null && b.price === null) return 0;
              if (a.price === null) return 1;
              if (b.price === null) return -1;
              return a.price - b.price;
            })
            .map(({ m, price }) => {
              const isBest = m.slug === row.bestMarketSlug;
              return (
                <div
                  key={m.id}
                  className={"grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 " + (isBest ? "bg-success/10" : "")}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.logo_color }} />
                  <span className="min-w-0 truncate text-sm font-medium">{m.name}</span>
                  {price === null ? (
                    <span className="shrink-0 text-xs text-muted-foreground">sem oferta</span>
                  ) : (
                    <span
                      className={
                        "shrink-0 tabular-nums text-sm " +
                        (isBest ? "font-bold text-success" : "font-semibold text-foreground/80")
                      }
                    >
                      {isBest && <TrendingDown className="mr-0.5 -mt-0.5 inline h-3 w-3" />}
                      {brl(price)}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}


function DesktopRow({ row, markets, isAdmin, onMerge }: {
  row: ComparisonRow; markets: Market[]; isAdmin: boolean; onMerge: (r: ComparisonRow) => void;
}) {
  const [added, setAdded] = useState(false);

  const addToList = async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      toast.error("Faça login para salvar sua lista", {
        action: { label: "Entrar", onClick: () => (window.location.href = "/auth") },
      });
      return;
    }
    const { error } = await supabase.from("shopping_list_items").insert({
      user_id: sess.session.user.id, product_key: row.product_key, product_name: row.name, quantity: 1,
    });
    if (error) toast.error("Não foi possível adicionar");
    else {
      setAdded(true);
      toast.success(`${row.name} adicionado à lista`);
      setTimeout(() => setAdded(false), 1500);
    }
  };

  return (
    <div className="hidden sm:flex rounded-2xl border bg-card p-4 items-center gap-4 shadow-[var(--shadow-card)]">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{row.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{row.category}{row.unit ? ` • ${row.unit}` : ""}</div>
        {row.bestPrice && row.worstPrice && row.bestPrice < row.worstPrice && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-success font-medium">
            <TrendingDown className="h-3 w-3" />
            Economia de {brl(row.worstPrice - row.bestPrice)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-[60%]">
        {markets
          .map((m) => ({ m, price: row.prices[m.slug] }))
          .sort((a, b) => {
            if (a.price === null && b.price === null) return 0;
            if (a.price === null) return 1;
            if (b.price === null) return -1;
            return a.price - b.price;
          })
          .map(({ m, price }) => {
            const isBest = m.slug === row.bestMarketSlug;
            return (
              <div
                key={m.id}
                className={
                  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm " +
                  (isBest ? "border-success/30 bg-success/10" : "bg-muted/40")
                }
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: m.logo_color }} />
                <span className="text-xs text-muted-foreground truncate max-w-[90px]">{m.name}</span>
                <span className={"tabular-nums font-semibold " + (isBest ? "text-success" : "text-foreground/80")}>
                  {price === null ? "—" : brl(price)}
                </span>
              </div>
            );
          })}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isAdmin && (
          <button onClick={() => onMerge(row)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:text-primary hover:bg-muted">
            <Merge className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={addToList}
          className={"grid h-8 w-8 place-items-center rounded-lg border transition " + (added ? "bg-success/10 border-success/30 text-success" : "bg-card text-muted-foreground hover:text-foreground")}
        >
          {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4 shadow-[var(--shadow-card)]">
      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"mt-1 text-xl sm:text-2xl font-bold " + (accent ? "text-success" : "")}>{value}</div>
    </div>
  );
}

function CategoryPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={"shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition " + (active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
    >
      {children}
    </button>
  );
}
