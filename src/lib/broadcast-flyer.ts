import type { ComparisonRow } from "./comparison";
import { brl } from "./comparison";

export type FlyerHighlight = {
  name: string;
  category: string;
  unit: string | null;
  bestPrice: number;
  worstPrice: number | null;
  bestMarket: string;
  savingsPct: number;
};

export function pickHighlights(rows: ComparisonRow[], marketNames: Record<string, string>, limit = 12): FlyerHighlight[] {
  return rows
    .filter((r) => r.marketCount >= 2 && r.bestPrice !== null && r.worstPrice !== null)
    .map((r) => ({
      name: r.name,
      category: r.category,
      unit: r.unit,
      bestPrice: r.bestPrice!,
      worstPrice: r.worstPrice!,
      bestMarket: marketNames[r.bestMarketSlug!] ?? r.bestMarketSlug!,
      savingsPct: ((r.worstPrice! - r.bestPrice!) / r.worstPrice!) * 100,
    }))
    .sort((a, b) => b.savingsPct - a.savingsPct)
    .slice(0, limit);
}

/**
 * Draw a shareable flyer PNG on a canvas. Returns a data URL.
 * Uses a portrait 1080x1920 layout suitable for WhatsApp.
 */
export async function renderFlyerPng(highlights: FlyerHighlight[]): Promise<{ dataUrl: string; caption: string }> {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#f0f9ff");
  bg.addColorStop(1, "#ffffff");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // header band
  ctx.fillStyle = "#0ea5e9";
  ctx.fillRect(0, 0, W, 240);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 78px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EncarteSaqua", W / 2, 110);
  ctx.font = "500 36px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText("Melhores ofertas da semana em Saquarema", W / 2, 170);

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  ctx.font = "500 28px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(today, W / 2, 215);

  // items grid: 2 cols x 6 rows
  const cols = 2;
  const startY = 290;
  const cardW = (W - 60 * (cols + 1)) / cols; // 60px gutter
  const cardH = 240;
  const items = highlights.slice(0, 12);

  items.forEach((it, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = 60 + c * (cardW + 60);
    const y = startY + r * (cardH + 24);

    // card
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x, y, cardW, cardH, 24);
    ctx.fill();
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.stroke();

    // discount badge
    ctx.fillStyle = "#dc2626";
    roundRect(ctx, x + cardW - 130, y + 16, 114, 44, 22);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`-${Math.round(it.savingsPct)}%`, x + cardW - 73, y + 46);

    // name
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 28px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.textAlign = "left";
    wrapText(ctx, it.name, x + 20, y + 55, cardW - 160, 32, 2);

    // unit
    if (it.unit) {
      ctx.fillStyle = "#64748b";
      ctx.font = "500 22px 'Plus Jakarta Sans', system-ui, sans-serif";
      ctx.fillText(it.unit, x + 20, y + 140);
    }

    // price
    ctx.fillStyle = "#059669";
    ctx.font = "bold 44px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.fillText(brl(it.bestPrice), x + 20, y + 195);

    // market
    ctx.fillStyle = "#475569";
    ctx.font = "600 20px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.fillText(`no ${it.bestMarket}`, x + 20, y + 220);
  });

  // footer
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, H - 120, W, 120);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Compare tudo em encartesaqua.com", W / 2, H - 65);
  ctx.font = "500 22px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("Preços atualizados diariamente", W / 2, H - 30);

  const dataUrl = canvas.toDataURL("image/png");

  const caption =
    `🛒 *Encarte semanal EncarteSaqua* (${today})\n\n` +
    items
      .slice(0, 8)
      .map(
        (it) =>
          `• ${it.name}${it.unit ? ` (${it.unit})` : ""} — ${brl(it.bestPrice)} no ${it.bestMarket} (-${Math.round(it.savingsPct)}%)`,
      )
      .join("\n") +
    `\n\nVeja todos: https://encarte-finder-buddy.lovable.app`;

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
        // last line: fit remainder with ellipsis if too long
        let remainder = words.slice(i).join(" ");
        while (ctx.measureText(remainder + "…").width > maxWidth && remainder.length > 3) {
          remainder = remainder.slice(0, -1);
        }
        ctx.fillText(remainder + (remainder !== words.slice(i).join(" ") ? "…" : ""), x, y + lines * lineHeight);
        return;
      }
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y + lines * lineHeight);
}
