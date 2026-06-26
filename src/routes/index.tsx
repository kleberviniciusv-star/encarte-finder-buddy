import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { Search, TrendingDown, Sparkles, Plus, Check, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
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
  const queryClient = useQueryClient();

  const marketsQ = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets });
  const productsQ = useQuery({ queryKey: ["flyer_products"], queryFn: fetchFlyerProducts });

  const markets = marketsQ.data ?? [];
  const rows = useMemo(
    () => (markets.length && productsQ.data ? buildComparison(markets, productsQ.data) : []),
    [markets, productsQ.data]
  );

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.category))), [rows]);
  const filtered = rows.filter(
    (r) =>
      (!category || r.category === category) &&
      r.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalSavings = rows.reduce(
    (acc, r) => acc + ((r.worstPrice ?? 0) - (r.bestPrice ?? 0)),
    0
  );

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-accent/40 via-background to-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <Badge className="mb-4 gap-1 bg-success/15 text-success hover:bg-success/15">
            <Sparkles className="h-3 w-3" /> Atualizado hoje
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Os encartes de Saquarema,<br />
            <span className="text-primary">comparados lado a lado.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Veja qual mercado tem o melhor preço de cada produto e monte sua lista de compras inteligente.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {markets.map((m) => (
              <MarketChip key={m.id} market={m} />
            ))}
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Stat label="Produtos comparados" value={String(rows.length)} />
            <Stat label="Mercados" value={String(markets.length)} />
            <Stat label="Economia possível" value={brl(totalSavings)} accent />
          </div>
        </div>
      </section>

      {/* Filtros */}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <CategoryPill active={category === null} onClick={() => setCategory(null)}>Todas</CategoryPill>
            {categories.map((c) => (
              <CategoryPill key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </CategoryPill>
            ))}
          </div>
        </div>

        {/* Tabela */}
        <div className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Produto</th>
                  {markets.map((m) => (
                    <th key={m.id} className="px-4 py-3 text-right">{m.name}</th>
                  ))}
                  <th className="px-4 py-3 text-right">Melhor</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const prev = filtered[i - 1];
                  const showDivider =
                    row.marketCount < 2 && (!prev || prev.marketCount >= 2);
                  return (
                    <Fragment key={row.product_key}>
                      {showDivider && (
                        <tr className="bg-muted/40">
                          <td colSpan={markets.length + 3} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Outros produtos dos encartes (sem comparação)
                          </td>
                        </tr>
                      )}
                      <Row row={row} markets={markets} />
                    </Fragment>
                  );
                })}

                {!filtered.length && (
                  <tr><td colSpan={markets.length + 3} className="px-4 py-12 text-center text-muted-foreground">
                    {productsQ.isLoading ? "Carregando encartes…" : "Nenhum produto encontrado."}
                  </td></tr>
                )}
              </tbody>

            </table>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Quer salvar uma lista e ver o total por mercado?{" "}
          <Link to="/auth" className="font-medium text-primary underline">Crie sua conta grátis</Link>.
        </p>
      </section>
    </div>
  );
}

function MarketChip({ market }: { market: Market }) {
  return (
    <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm shadow-sm">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: market.logo_color }} />
      <span className="font-medium">{market.name}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"mt-1 text-2xl font-bold " + (accent ? "text-success" : "")}>{value}</div>
    </div>
  );
}

function CategoryPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-medium transition " +
        (active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")
      }
    >
      {children}
    </button>
  );
}

function Row({ row, markets }: { row: ComparisonRow; markets: Market[] }) {
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
      user_id: sess.session.user.id,
      product_key: row.product_key,
      product_name: row.name,
      quantity: 1,
    });
    if (error) toast.error("Não foi possível adicionar");
    else {
      setAdded(true);
      toast.success(`${row.name} adicionado à lista`);
      setTimeout(() => setAdded(false), 1500);
    }
  };

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="px-4 py-3">
        <div className="font-medium">{row.name}</div>
        <div className="text-xs text-muted-foreground">{row.category} • {row.unit}</div>
      </td>
      {markets.map((m) => {
        const price = row.prices[m.slug];
        const isBest = m.slug === row.bestMarketSlug;
        return (
          <td key={m.id} className="px-4 py-3 text-right">
            {price === null ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              <span
                className={
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 tabular-nums " +
                  (isBest ? "bg-success/15 font-semibold text-success" : "text-foreground/80")
                }
              >
                {isBest && <TrendingDown className="h-3 w-3" />}
                {brl(price)}
              </span>
            )}
          </td>
        );
      })}
      <td className="px-4 py-3 text-right">
        {row.bestMarketSlug && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">
              {markets.find((m) => m.slug === row.bestMarketSlug)?.name}
            </div>
            <div className="font-bold text-success tabular-nums">{brl(row.bestPrice!)}</div>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button size="sm" variant={added ? "secondary" : "outline"} onClick={addToList}>
          {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </Button>
      </td>
    </tr>
  );
}
