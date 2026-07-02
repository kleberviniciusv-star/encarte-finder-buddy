import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DuplicatePairDTO = {
  keep_key: string;
  keep_name: string;
  remove_key: string;
  remove_name: string;
  reason: string;
};

export const detectDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { products: { key: string; name: string; category: string }[] }) => data,
  )
  .handler(async ({ data, context }): Promise<{ pairs: DuplicatePairDTO[] }> => {
    // Only admins
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Response("Forbidden", { status: 403 });

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

    const productList = data.products
      .map((p) => `${p.key} | ${p.name} | ${p.category}`)
      .join("\n");

    const prompt = `Você é um assistente especializado em identificar produtos duplicados em encartes de supermercado brasileiros.

Analise a lista abaixo (formato: chave | nome | categoria) e identifique pares de produtos que representam o MESMO item com nomes diferentes.

PRODUTOS:
${productList}

Retorne APENAS um JSON válido no formato:
{"pairs":[{"keep_key":"...","keep_name":"...","remove_key":"...","remove_name":"...","reason":"..."}]}

Se não houver duplicados, retorne: {"pairs":[]}

Regras:
- Só una produtos da mesma categoria
- Só una se tiver certeza que é o mesmo produto
- Prefira manter o nome mais descritivo como canonical
- Abreviações, variações de ortografia e nomes parciais contam como duplicados`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
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
    let parsed: { pairs?: DuplicatePairDTO[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }
    return { pairs: parsed.pairs ?? [] };
  });
