import type { ComparisonRow, Market } from "./comparison";
import { brl } from "./comparison";

export type FlyerHighlight = {
  name: string;
  category: string;
  unit: string | null;
  imageUrl: string | null;
  marketPrices: { marketName: string; marketColor: string; price: number }[]; // sorted asc
  bestPrice: number;
  bestMarket: string;
  savingsPct: number; // 0 if only 1 market
};

/**
 * Build highlights from full comparison + product image data.
 * Prioritises items with images and multiple markets, but also includes single-market items.
 */
export function pickHighlights(
  rows: ComparisonRow[],
  markets: Market[],
  imagesByKey: Record<string, string | null>,
  limit = 12,
): FlyerHighlight[] {
  const marketBySlug = new Map(markets.map((m) => [m.slug, m]));
  const enriched = rows
    .filter((r) => r.bestPrice !== null)
    .map((r) => {
      const marketPrices = Object.entries(r.prices)
        .filter(([, v]) => v !== null)
        .map(([slug, price]) => {
          const m = marketBySlug.get(slug)!;
          return { marketName: m?.name ?? slug, marketColor: m?.logo_color ?? "#0ea5e9", price: price as number };
        })
        .sort((a, b) => a.price - b.price);
      const savingsPct =
        r.worstPrice && r.bestPrice && r.worstPrice > r.bestPrice
          ? ((r.worstPrice - r.bestPrice) / r.worstPrice) * 100
          : 0;
      return {
        name: r.name,
        category: r.category,
        unit: r.unit,
        imageUrl: imagesByKey[r.product_key] ?? null,
        marketPrices,
        bestPrice: r.bestPrice!,
        bestMarket: marketPrices[0]?.marketName ?? "",
        savingsPct,
      };
    });

  enriched.sort((a, b) => {
    // 1. items with image first
    const ai = a.imageUrl ? 1 : 0;
    const bi = b.imageUrl ? 1 : 0;
    if (ai !== bi) return bi - ai;
    // 2. more markets = better comparison
    if (a.marketPrices.length !== b.marketPrices.length) return b.marketPrices.length - a.marketPrices.length;
    // 3. bigger savings
    return b.savingsPct - a.savingsPct;
  });

  return enriched.slice(0, limit);
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Renders a WhatsApp-friendly portrait flyer (1080x1920) with product images
 * and prices from every market that carries each product.
 */
export async function renderFlyerPng(
  highlights: FlyerHighlight[],
): Promise<{ dataUrl: string; caption: string }> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // background
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, H);

  // header
  const header = ctx.createLinearGradient(0, 0, W, 0);
  header.addColorStop(0, "#0ea5e9");
  header.addColorStop(1, "#0369a1");
  ctx.fillStyle = header;
  ctx.fillRect(0, 0, W, 220);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 72px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Encarte da Semana", W / 2, 105);

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  ctx.font = "500 30px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("Ofertas de Saquarema · " + today, W / 2, 160);

  // preload all images in parallel
  const images = await Promise.all(
    highlights.map((h) => (h.imageUrl ? loadImage(h.imageUrl) : Promise.resolve(null))),
  );

  // grid: 2 cols x 4 rows = 8 items (better fit for images + price stacks)
  const items = highlights.slice(0, 8);
  const cols = 2;
  const gutter = 40;
  const startY = 260;
  const cardW = (W - gutter * (cols + 1)) / cols;
  const cardH = 380;

  items.forEach((it, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = gutter + c * (cardW + gutter);
    const y = startY + r * (cardH + 24);

    // card
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x, y, cardW, cardH, 20);
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.stroke();

    // image area
    const imgArea = 170;
    const img = images[i];
    if (img) {
      // fit contain
      const scale = Math.min(imgArea / img.width, imgArea / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, x + (cardW - dw) / 2, y + 12, dw, dh);
    } else {
      // placeholder
      ctx.fillStyle = "#f1f5f9";
      roundRect(ctx, x + (cardW - imgArea) / 2, y + 12, imgArea, imgArea, 12);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 22px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("sem imagem", x + cardW / 2, y + 12 + imgArea / 2 + 8);
    }

    // savings badge (top-right) only when > 0
    if (it.savingsPct >= 5) {
      ctx.fillStyle = "#dc2626";
      roundRect(ctx, x + cardW - 110, y + 14, 96, 40, 20);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("-" + Math.round(it.savingsPct) + "%", x + cardW - 62, y + 41);
    }

    // name
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 24px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.textAlign = "left";
    wrapText(ctx, it.name, x + 18, y + imgArea + 40, cardW - 36, 28, 2);

    // price rows
    const rowsStartY = y + imgArea + 105;
    const rowH = 30;
    const maxRows = 4;
    const shown = it.marketPrices.slice(0, maxRows);
    shown.forEach((mp, idx) => {
      const ry = rowsStartY + idx * rowH;
      // color dot
      ctx.fillStyle = mp.marketColor;
      ctx.beginPath();
      ctx.arc(x + 24, ry - 6, 6, 0, Math.PI * 2);
      ctx.fill();
      // market name
      ctx.fillStyle = idx === 0 ? "#0f172a" : "#475569";
      ctx.font = (idx === 0 ? "bold " : "500 ") + "20px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = "left";
      const nameMax = cardW - 160;
      let mname = mp.marketName;
      while (ctx.measureText(mname).width > nameMax && mname.length > 3) mname = mname.slice(0, -1);
      if (mname !== mp.marketName) mname += "…";
      ctx.fillText(mname, x + 40, ry);
      // price
      ctx.fillStyle = idx === 0 ? "#059669" : "#334155";
      ctx.font = (idx === 0 ? "bold 22px " : "600 20px ") + "'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(brl(mp.price), x + cardW - 18, ry);
    });
    if (it.marketPrices.length > maxRows) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 16px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("+ " + (it.marketPrices.length - maxRows) + " mercado(s)", x + 24, rowsStartY + maxRows * rowH);
    }
  });

  // footer
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, H - 110, W, 110);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Compare tudo em encartesaqua.com", W / 2, H - 60);
  ctx.font = "500 22px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Preços coletados dos encartes oficiais", W / 2, H - 28);

  const dataUrl = canvas.toDataURL("image/png");

  const captionItems = items.slice(0, 8);
  const caption =
    "🛒 *Encarte da Semana - EncarteSaqua* (" +
    today +
    ")\n\n" +
    captionItems
      .map((it) => {
        const priceList = it.marketPrices
          .map((mp) => `  · ${mp.marketName}: ${brl(mp.price)}`)
          .join("\n");
        const header = `*${it.name}*${it.unit ? " (" + it.unit + ")" : ""}` +
          (it.savingsPct >= 5 ? ` — economia de ${Math.round(it.savingsPct)}%` : "");
        return header + "\n" + priceList;
      })
      .join("\n\n") +
    "\n\nVeja todos: https://encarte-finder-buddy.lovable.app";

  return { dataUrl, caption };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = words[i];
      lines++;
      if (lines >= maxLines - 1) {
        let remainder = words.slice(i).join(" ");
        while (ctx.measureText(remainder + "…").width > maxWidth && remainder.length > 3) {
          remainder = remainder.slice(0, -1);
        }
        ctx.fillText(
          remainder + (remainder !== words.slice(i).join(" ") ? "…" : ""),
          x,
          y + lines * lineHeight,
        );
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight);
}
