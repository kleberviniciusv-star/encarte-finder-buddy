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

/**
 * Build FULL highlight list (no limit) — one entry per unique product with best price.
 * Sorted: items with images first, then by market count, then by savings, then by name.
 */
export function buildAllHighlights(
  rows: ComparisonRow[],
  markets: Market[],
  imagesByKey: Record<string, string | null>,
): FlyerHighlight[] {
  return pickHighlights(rows, markets, imagesByKey, Number.MAX_SAFE_INTEGER);
}

async function imageToJpegDataUrl(url: string, maxSize = 300): Promise<string | null> {
  const img = await loadImage(url);
  if (!img) return null;
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#ffffff";
  cx.fillRect(0, 0, w, h);
  cx.drawImage(img, 0, 0, w, h);
  try {
    return c.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

/**
 * Renders a multi-page A4 PDF with ALL items, mimicking a real market flyer:
 * product image on top, name, unit, then prices from every market that carries it.
 */
export async function renderFlyerPdf(
  highlights: FlyerHighlight[],
): Promise<{ blob: Blob; dataUrl: string; filename: string }> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const PW = 210;
  const PH = 297;

  // Preload all product images in parallel as JPEG data URLs
  const imgUrls = await Promise.all(
    highlights.map((h) => (h.imageUrl ? imageToJpegDataUrl(h.imageUrl) : Promise.resolve(null))),
  );

  // ---- Header (page 1) ----
  const drawHeader = (pageIdx: number, totalPages: number) => {
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, PW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Encarte da Semana", 10, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const today = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    doc.text("Ofertas de Saquarema · " + today, 10, 16);
    doc.text(`Página ${pageIdx} de ${totalPages}`, PW - 10, 16, { align: "right" });
  };

  // Grid layout
  const cols = 3;
  const gutter = 6;
  const marginX = 8;
  const marginTop = 28;
  const marginBottom = 14;
  const cardW = (PW - marginX * 2 - gutter * (cols - 1)) / cols;
  const cardH = 78; // mm — image + name + up to ~4 price rows
  const rowsPerPage = Math.floor((PH - marginTop - marginBottom) / (cardH + gutter));
  const perPage = cols * rowsPerPage;
  const totalPages = Math.max(1, Math.ceil(highlights.length / perPage));

  highlights.forEach((h, i) => {
    const pageIdx = Math.floor(i / perPage);
    const onPage = i % perPage;
    if (onPage === 0) {
      if (pageIdx > 0) doc.addPage();
      drawHeader(pageIdx + 1, totalPages);
    }
    const c = onPage % cols;
    const r = Math.floor(onPage / cols);
    const x = marginX + c * (cardW + gutter);
    const y = marginTop + r * (cardH + gutter);

    // Card background
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");

    // Image area
    const imgBox = 30; // mm
    const imgX = x + (cardW - imgBox) / 2;
    const imgY = y + 3;
    const dataUrl = imgUrls[i];
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, "JPEG", imgX, imgY, imgBox, imgBox, undefined, "FAST");
      } catch {
        /* ignore */
      }
    } else {
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(imgX, imgY, imgBox, imgBox, 2, 2, "F");
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text("sem imagem", x + cardW / 2, imgY + imgBox / 2 + 1, { align: "center" });
    }

    // Savings badge
    if (h.savingsPct >= 5) {
      const bw = 16;
      const bh = 5;
      doc.setFillColor(220, 38, 38);
      doc.roundedRect(x + cardW - bw - 2, y + 2, bw, bh, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("-" + Math.round(h.savingsPct) + "%", x + cardW - bw / 2 - 2, y + 5.6, {
        align: "center",
      });
    }

    // Name
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const nameY = imgY + imgBox + 4;
    const nameLines = doc.splitTextToSize(h.name, cardW - 4).slice(0, 2);
    doc.text(nameLines, x + 2, nameY);
    if (h.unit) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(h.unit, x + 2, nameY + nameLines.length * 3.5 + 1);
    }

    // Prices
    const pricesY = nameY + nameLines.length * 3.5 + (h.unit ? 5 : 2);
    const maxRows = 4;
    const shown = h.marketPrices.slice(0, maxRows);
    shown.forEach((mp, idx) => {
      const ry = pricesY + idx * 4.4;
      // color dot
      const hex = mp.marketColor.replace("#", "");
      const rr = parseInt(hex.slice(0, 2), 16) || 14;
      const gg = parseInt(hex.slice(2, 4), 16) || 165;
      const bb = parseInt(hex.slice(4, 6), 16) || 233;
      doc.setFillColor(rr, gg, bb);
      doc.circle(x + 3, ry - 1, 1, "F");

      const isBest = idx === 0;
      doc.setFont("helvetica", isBest ? "bold" : "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(isBest ? 15 : 71, isBest ? 23 : 85, isBest ? 42 : 105);
      let mname = mp.marketName;
      const maxW = cardW - 22;
      while (doc.getTextWidth(mname) > maxW && mname.length > 3) mname = mname.slice(0, -1);
      if (mname !== mp.marketName) mname += "…";
      doc.text(mname, x + 5.5, ry);

      doc.setFont("helvetica", isBest ? "bold" : "normal");
      doc.setTextColor(isBest ? 5 : 51, isBest ? 150 : 65, isBest ? 105 : 85);
      doc.text(brl(mp.price), x + cardW - 2, ry, { align: "right" });
    });
    if (h.marketPrices.length > maxRows) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        "+ " + (h.marketPrices.length - maxRows) + " mercado(s)",
        x + 3,
        pricesY + maxRows * 4.4,
      );
    }
  });

  // Footer on every page
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(15, 23, 42);
    doc.rect(0, PH - 10, PW, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Compare tudo em encartesaqua.com", PW / 2, PH - 4, { align: "center" });
  }

  const blob = doc.output("blob");
  const dataUrl = doc.output("datauristring");
  const filename = "encarte-semana-" + new Date().toISOString().slice(0, 10) + ".pdf";
  return { blob, dataUrl, filename };
}
