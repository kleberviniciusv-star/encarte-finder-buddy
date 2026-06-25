import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, Trash2, Plus, Minus, ShoppingBag } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  brl,
  fetchFlyerProducts,
  fetchMarkets,
  type FlyerProduct,
  type Market,
} from "@/lib/comparison";

export const Route = createFileRoute("/_authenticated/lista")({
  head: () => ({ meta: [{ title: "Minha lista — EncarteSaqua" }] }),
  component: ListaPage,
});

type Item = {
  id: string;
  product_key: string;
  product_name: string;
  quantity: number;
};

async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("id, product_key, product_name, quantity")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Item[];
}

function computeTotals(items: Item[], markets: Market[], products: FlyerProduct[]) {
  return markets.map((m) => {
    let total = 0;
    let coverage = 0;
    for (const it of items) {
      const p = products.find((p) => p.product_key === it.product_key && p.market_id === m.id);
      if (p) {
        total += p.price * it.quantity;
        coverage += 1;
      }
    }
    return { market: m, total, coverage, missing: items.length - coverage };
  });
}

function ListaPage() {
  const qc = useQueryClient();
  const itemsQ = useQuery({ queryKey: ["my-list"], queryFn: fetchItems });
  const marketsQ = useQuery({ queryKey: ["markets"], queryFn: fetchMarkets });
  const productsQ = useQuery({ queryKey: ["flyer_products"], queryFn: fetchFlyerProducts });

  const items = itemsQ.data ?? [];
  const markets = marketsQ.data ?? [];
  const products = productsQ.data ?? [];
  const totals = markets.length ? computeTotals(items, markets, products) : [];
  const winner = totals.length ? [...totals].sort((a, b) => a.total - b.total)[0] : null;

  const updateQty = async (id: string, delta: number, current: number) => {
    const newQty = Math.max(1, current + delta);
    await supabase.from("shopping_list_items").update({ quantity: newQty }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["my-list"] });
  };
  const remove = async (id: string) => {
    await supabase.from("shopping_list_items").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["my-list"] });
    toast.success("Item removido");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Minha lista de compras</h1>
          <p className="mt-1 text-muted-foreground">
            Adicione produtos no comparador e veja onde sair mais barato.
          </p>
        </div>
        <Button asChild variant="outline"><Link to="/">+ Adicionar produtos</Link></Button>
      </div>

      {/* Comparativo de totais */}
      {items.length > 0 && (
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {totals.map(({ market, total, missing }) => {
            const isWinner = winner?.market.id === market.id;
            return (
              <div
                key={market.id}
                className={
                  "relative rounded-2xl border bg-card p-5 shadow-[var(--shadow-card)] " +
                  (isWinner ? "ring-2 ring-success" : "")
                }
              >
                {isWinner && (
                  <Badge className="absolute -top-2 right-4 gap-1 bg-success text-success-foreground hover:bg-success">
                    <Trophy className="h-3 w-3" /> Melhor escolha
                  </Badge>
                )}
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: market.logo_color }} />
                  <span className="font-semibold">{market.name}</span>
                </div>
                <div className="mt-3 text-3xl font-extrabold tabular-nums">{brl(total)}</div>
                {missing > 0 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {missing} item(s) não estão neste encarte
                  </div>
                )}
                {market.address && (
                  <div className="mt-3 text-xs text-muted-foreground">{market.address}</div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Itens */}
      <section className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-card)]">
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
              <ShoppingBag className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">Sua lista está vazia</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Vá ao comparador e clique no <strong>+</strong> ao lado dos produtos que deseja comprar.
            </p>
            <Button asChild className="mt-6"><Link to="/">Ver encartes</Link></Button>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((it) => {
              const pricesPerMarket = markets.map((m) => {
                const p = products.find((p) => p.product_key === it.product_key && p.market_id === m.id);
                return { market: m, price: p?.price ?? null };
              });
              const best = pricesPerMarket
                .filter((x) => x.price !== null)
                .sort((a, b) => (a.price as number) - (b.price as number))[0];
              return (
                <div key={it.id} className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{it.product_name}</div>
                    {best && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Mais barato: <span className="text-success font-medium">{best.market.name}</span> ({brl(best.price as number)})
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 rounded-lg border bg-background">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateQty(it.id, -1, it.quantity)}>
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">{it.quantity}</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => updateQty(it.id, 1, it.quantity)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(it.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
