import { createFileRoute } from "@tanstack/react-router";

type ExtractedProduct = {
  name: string;
  price: number;
  unit?: string | null;
  category?: string | null;
};

const BROWSER_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Extract flyer image URLs from a market page. */
async function listFlyerImages(market: { slug: string; flyer_url: string }): Promise<string[]> {
  const res = await fetch(market.flyer_url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`Falha ao buscar ${market.flyer_url}: HTTP ${res.status}`);
  const html = await res.text();

  const found = new Set<string>();
  const re = /(?:src|data-src|href)=["']([^"']+\.(?:jpe?g|png|webp))(?:\?[^"']*)?["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = absoluteUrl(m[1], market.flyer_url);
    const lower = url.toLowerCase();

    if (market.slug === "juzan") {
      if (lower.includes("/uploads/encartes/")) found.add(url);
    } else if (market.slug === "gomes") {
      // Páginas do encarte do Gomes: wa_images/gomes ate ... .jpg
      if (
        lower.includes("/wa_images/") &&
        /gomes[^/]*\.(jpe?g|png|webp)$/.test(lower) &&
        !lower.includes("logo") &&
        !lower.includes("icone")
      ) {
        found.add(url);
      }
    } else {
      // Fallback genérico
      if (lower.match(/encarte|flyer|oferta/)) found.add(url);
    }
  }
  return Array.from(found);
}

/** Call Lovable AI Gateway (Gemini vision) to extract products from a flyer image. */
async function extractProductsFromImage(imageUrl: string): Promise<ExtractedProduct[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const body = {
    model: "google/gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content:
          "Você lê encartes de supermercados brasileiros. Extraia TODOS os produtos visíveis com seu preço promocional. Responda APENAS com JSON válido no formato {\"products\":[{\"name\":\"...\",\"price\":0.00,\"unit\":\"1kg|500g|1L|unidade\",\"category\":\"Hortifruti|Açougue|Padaria|Mercearia|Bebidas|Limpeza|Higiene|Laticínios|Congelados|Outros\"}]}. Preço como número decimal em reais (ex: 12.99). Use o nome real e completo do produto como aparece no encarte (marca + descrição), sem inventar.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Extraia todos os produtos e preços deste encarte." },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: { products?: ExtractedProduct[] } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to find a JSON object substring
    const match = content.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  }
  return (parsed.products ?? []).filter(
    (p) => p && typeof p.name === "string" && typeof p.price === "number" && p.price > 0,
  );
}

async function refreshMarket(market: {
  id: string;
  slug: string;
  name: string;
  flyer_url: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const images = await listFlyerImages(market);
  if (!images.length) {
    return { market: market.slug, images: 0, products: 0, note: "nenhuma imagem encontrada" };
  }

  // Extract products from each image (sequential to be friendly with rate limits)
  const all: ExtractedProduct[] = [];
  const errors: string[] = [];
  for (const img of images) {
    try {
      const products = await extractProductsFromImage(img);
      all.push(...products);
    } catch (err) {
      errors.push(`${img}: ${(err as Error).message}`);
    }
  }

  // Deduplicate by product_key keeping the lowest price
  const byKey = new Map<string, ExtractedProduct & { product_key: string }>();
  for (const p of all) {
    const key = slugify(p.name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || p.price < existing.price) {
      byKey.set(key, { ...p, product_key: key });
    }
  }

  // Replace flyer_products for this market
  const del = await supabaseAdmin.from("flyer_products").delete().eq("market_id", market.id);
  if (del.error) throw new Error(del.error.message);

  const rows = Array.from(byKey.values()).map((p) => ({
    market_id: market.id,
    product_key: p.product_key,
    name: p.name.trim(),
    price: p.price,
    unit: p.unit ?? null,
    category: (p.category ?? "Outros").trim() || "Outros",
  }));

  if (rows.length) {
    const ins = await supabaseAdmin.from("flyer_products").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }

  await supabaseAdmin
    .from("markets")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", market.id);

  return {
    market: market.slug,
    images: images.length,
    products: rows.length,
    errors: errors.length ? errors : undefined,
  };
}

export const Route = createFileRoute("/api/public/hooks/refresh-flyers")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: markets, error } = await supabaseAdmin
            .from("markets")
            .select("id, slug, name, flyer_url")
            .not("flyer_url", "is", null);
          if (error) throw new Error(error.message);

          const results = [];
          for (const m of markets ?? []) {
            try {
              results.push(await refreshMarket(m as typeof m & { flyer_url: string }));
            } catch (err) {
              results.push({ market: m.slug, error: (err as Error).message });
            }
          }

          return Response.json({ success: true, results });
        } catch (err) {
          return Response.json(
            { success: false, error: (err as Error).message },
            { status: 500 },
          );
        }
      },
      GET: async () =>
        Response.json({
          info: "POST para atualizar encartes (Juzan + Gomes via OCR Gemini Vision).",
        }),
    },
  },
});
