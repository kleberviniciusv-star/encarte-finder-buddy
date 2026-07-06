import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_products",
  title: "Search flyer products",
  description:
    "Search products from all current supermarket flyers by name (case-insensitive substring). Returns each match with market, price, unit and category. Use to compare prices across markets.",
  inputSchema: {
    query: z.string().min(1).describe("Search term, e.g. 'arroz', 'coca cola', 'coxa de frango'."),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 40)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = client(ctx);
    const { data, error } = await sb
      .from("flyer_products")
      .select("name, price, unit, category, product_key, market:markets(slug, name)")
      .ilike("name", `%${query}%`)
      .order("price", { ascending: true })
      .limit(limit ?? 40);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { results: data ?? [] },
    };
  },
});
