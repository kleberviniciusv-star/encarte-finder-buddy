import { supabase } from "@/integrations/supabase/client";

export type Market = {
  id: string;
  slug: string;
  name: string;
  logo_color: string;
  address: string | null;
  flyer_url?: string | null;
  last_synced_at?: string | null;
};

export type FlyerProduct = {
  id: string;
  market_id: string;
  product_key: string;
  name: string;
  category: string;
  unit: string | null;
  price: number;
  valid_until: string | null;
};

export type ComparisonRow = {
  product_key: string;
  name: string;
  category: string;
  unit: string | null;
  prices: Record<string, number | null>; // market.slug -> price
  bestMarketSlug: string | null;
  bestPrice: number | null;
  worstPrice: number | null;
  marketCount: number;
};

export async function fetchMarkets(): Promise<Market[]> {
  const { data, error } = await supabase.from("markets").select("*").order("name");
  if (error) throw error;
  return data as Market[];
}

export async function fetchFlyerProducts(): Promise<FlyerProduct[]> {
  const { data, error } = await supabase.from("flyer_products").select("*");
  if (error) throw error;
  return (data as unknown as FlyerProduct[]).map((p) => ({ ...p, price: Number(p.price) }));
}

export function buildComparison(markets: Market[], products: FlyerProduct[]): ComparisonRow[] {
  const byKey = new Map<string, ComparisonRow>();
  for (const p of products) {
    const market = markets.find((m) => m.id === p.market_id);
    if (!market) continue;
    let row = byKey.get(p.product_key);
    if (!row) {
      row = {
        product_key: p.product_key,
        name: p.name,
        category: p.category,
        unit: p.unit,
        prices: Object.fromEntries(markets.map((m) => [m.slug, null])),
        bestMarketSlug: null,
        bestPrice: null,
        worstPrice: null,
        marketCount: 0,
      };
      byKey.set(p.product_key, row);
    }
    row.prices[market.slug] = p.price;
  }
  for (const row of byKey.values()) {
    const entries = Object.entries(row.prices).filter(([, v]) => v !== null) as [string, number][];
    row.marketCount = entries.length;
    if (!entries.length) continue;
    entries.sort((a, b) => a[1] - b[1]);
    row.bestMarketSlug = entries[0][0];
    row.bestPrice = entries[0][1];
    row.worstPrice = entries[entries.length - 1][1];
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const aCompared = a.marketCount >= 2 ? 1 : 0;
    const bCompared = b.marketCount >= 2 ? 1 : 0;
    if (aCompared !== bCompared) return bCompared - aCompared;
    if (a.marketCount !== b.marketCount) return b.marketCount - a.marketCount;
    return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
  });
}


export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
