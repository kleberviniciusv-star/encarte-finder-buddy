import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminMergeProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { source_key: string; target_key: string }) => {
    if (!data?.source_key || !data?.target_key) throw new Error("Invalid input");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Response("Forbidden", { status: 403 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("admin_merge_products", {
      _source_key: data.source_key,
      _target_key: data.target_key,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
