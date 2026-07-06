import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function client(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default defineTool({
  name: "add_shopping_item",
  title: "Add shopping list item",
  description:
    "Add an item to the signed-in user's shopping list. Provide product_key from `search_products` when available; otherwise it is derived from product_name.",
  inputSchema: {
    product_name: z.string().trim().min(1).describe("Human-readable product name."),
    product_key: z.string().trim().optional().describe("Canonical key (from search_products.product_key)."),
    quantity: z.number().int().min(1).max(999).optional().describe("Quantity (default 1)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ product_name, product_key, quantity }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const key = product_key?.trim() || slugify(product_name);
    if (!key) {
      return { content: [{ type: "text", text: "Invalid product name" }], isError: true };
    }
    const { data, error } = await client(ctx)
      .from("shopping_list_items")
      .insert({
        user_id: ctx.getUserId(),
        product_key: key,
        product_name: product_name.trim(),
        quantity: quantity ?? 1,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Adicionado: ${data.product_name} (x${data.quantity})` }],
      structuredContent: { item: data },
    };
  },
});
