import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AutoMergeResult = {
  analyzed: number;
  pairsFound: number;
  merged: number;
  errors: string[];
};

type DuplicatePair = {
  keep_key: string;
  keep_name: string;
  remove_key: string;
  remove_name: string;
  reason?: string;
};

/**
 * Detect duplicates across markets with Gemini and merge them by rewriting
 * product_key across flyer_products + shopping_list_items. Runs with an
 * admin/service-role client (bypasses RLS) so it can be called from webhooks
 * and admin actions alike.
 */
export async function autoMergeDuplicates(
  supabaseAdmin: SupabaseClient<Database>,
): Promise<AutoMergeResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const { data: rows, error } = await supabaseAdmin
    .from("flyer_products")
    .select("product_key, name, category");
  if (error) throw new Error(error.message);

  // Distinct products only
  const uniq = Array.from(
    new Map(
      (rows ?? []).map((p) => [
        p.product_key,
        { key: p.product_key, name: p.name, category: p.category },
      ]),
    ).values(),
  );

  if (uniq.length < 2) {
    return { analyzed: uniq.length, pairsFound: 0, merged: 0, errors: [] };
  }

  const list = uniq.map((p) => `${p.key} | ${p.name} | ${p.category}`).join("\n");

  const prompt = `Você é um assistente especializado em identificar produtos duplicados em encartes de supermercado brasileiros.

Analise a lista abaixo (formato: chave | nome | categoria) e identifique pares que representam o MESMO item com nomes diferentes (abreviações, variações de ortografia, ordem de palavras, marca omitida etc.).

PRODUTOS:
${list}

Retorne APENAS um JSON válido no formato:
{"pairs":[{"keep_key":"...","keep_name":"...","remove_key":"...","remove_name":"...","reason":"..."}]}

Se não houver duplicados, retorne: {"pairs":[]}

Regras:
- Só una produtos da mesma categoria
- Só una se tiver alta certeza que é o mesmo produto
- Prefira manter como canonical o nome mais descritivo
- Não crie cadeias: se A=B e B=C, gere apenas um par por remoção`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? '{"pairs":[]}';
  let parsed: { pairs?: DuplicatePair[] } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }

  const pairs = parsed.pairs ?? [];

  // Resolve chains: follow remove_key -> keep_key transitively
  const rename = new Map<string, string>();
  for (const p of pairs) {
    if (!p.keep_key || !p.remove_key || p.keep_key === p.remove_key) continue;
    rename.set(p.remove_key, p.keep_key);
  }
  const resolve = (k: string, seen = new Set<string>()): string => {
    if (seen.has(k)) return k;
    seen.add(k);
    const next = rename.get(k);
    return next ? resolve(next, seen) : k;
  };

  const errors: string[] = [];
  let merged = 0;
  for (const [from] of rename) {
    const to = resolve(from);
    if (to === from) continue;
    const { error: rpcErr } = await supabaseAdmin.rpc("admin_merge_products", {
      _source_key: from,
      _target_key: to,
    });
    if (rpcErr) {
      // admin_merge_products requires an authenticated admin. Fall back to direct
      // updates when running with service role (webhook / cron).
      const upd1 = await supabaseAdmin
        .from("flyer_products")
        .update({ product_key: to })
        .eq("product_key", from);
      const upd2 = await supabaseAdmin
        .from("shopping_list_items")
        .update({ product_key: to })
        .eq("product_key", from);
      if (upd1.error || upd2.error) {
        errors.push(`${from} -> ${to}: ${upd1.error?.message ?? upd2.error?.message}`);
        continue;
      }
    }
    merged++;
  }

  return { analyzed: uniq.length, pairsFound: rename.size, merged, errors };
}
