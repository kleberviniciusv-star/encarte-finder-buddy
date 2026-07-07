import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Merge, Check, X, Loader2, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { fetchFlyerProducts } from "@/lib/comparison";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { detectDuplicates } from "@/lib/detect-duplicates.functions";
import { runAutoMergeDuplicates } from "@/lib/auto-merge-duplicates.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — EncarteSaqua" }] }),
  ssr: false,
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/" });
  },
  component: AdminPage,
});

type DuplicatePair = {
  keep: { key: string; name: string };
  remove: { key: string; name: string };
  reason: string;
  merged?: boolean;
  dismissed?: boolean;
};

function AdminPage() {
  const qc = useQueryClient();
  const productsQ = useQuery({
    queryKey: ["flyer_products"],
    queryFn: fetchFlyerProducts,
  });

  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [mergingAll, setMergingAll] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [autoMerging, setAutoMerging] = useState(false);

  const products = productsQ.data ?? [];
  const uniqueProducts = Array.from(
    new Map(
      products.map((p) => [
        p.product_key,
        { key: p.product_key, name: p.name, category: p.category },
      ]),
    ).values(),
  );

  const analyze = async () => {
    if (uniqueProducts.length === 0) {
      toast.error("Nenhum produto carregado ainda.");
      return;
    }
    setAnalyzing(true);
    setPairs([]);
    setAnalyzed(false);
    try {
      const result = await detectDuplicates({ data: { products: uniqueProducts } });
      const mapped: DuplicatePair[] = (result.pairs || []).map((p) => ({
        keep: { key: p.keep_key, name: p.keep_name },
        remove: { key: p.remove_key, name: p.remove_name },
        reason: p.reason,
      }));
      setPairs(mapped);
      setAnalyzed(true);
      if (mapped.length === 0) toast.success("Nenhum duplicado encontrado!");
      else toast.info(`${mapped.length} par(es) de duplicados encontrado(s).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido";
      toast.error("Falha na análise: " + msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const mergePair = async (pair: DuplicatePair, index: number) => {
    const { error } = await supabase.rpc("admin_merge_products", {
      _source_key: pair.remove.key,
      _target_key: pair.keep.key,
    });
    if (error) {
      toast.error("Falha ao unir: " + error.message);
    } else {
      toast.success(`"${pair.remove.name}" unido com sucesso.`);
      setPairs((prev) => prev.map((p, i) => (i === index ? { ...p, merged: true } : p)));
      await qc.invalidateQueries({ queryKey: ["flyer_products"] });
    }
  };

  const dismissPair = (index: number) => {
    setPairs((prev) => prev.map((p, i) => (i === index ? { ...p, dismissed: true } : p)));
  };

  const mergeAll = async () => {
    const pending = pairs.filter((p) => !p.merged && !p.dismissed);
    if (pending.length === 0) return;
    setMergingAll(true);
    let success = 0;
    for (const pair of pending) {
      const idx = pairs.indexOf(pair);
      const { error } = await supabase.rpc("admin_merge_products", {
        _source_key: pair.remove.key,
        _target_key: pair.keep.key,
      });
      if (!error) {
        success++;
        setPairs((prev) => prev.map((p, j) => (j === idx ? { ...p, merged: true } : p)));
      }
    }
    await qc.invalidateQueries({ queryKey: ["flyer_products"] });
    toast.success(`${success} produto(s) unido(s) com sucesso!`);
    setMergingAll(false);
  };

  const pending = pairs.filter((p) => !p.merged && !p.dismissed);
  const merged = pairs.filter((p) => p.merged);
  const dismissed = pairs.filter((p) => p.dismissed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Painel Admin</h1>
        <p className="mt-1 text-muted-foreground">Ferramentas de gestão dos encartes.</p>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Detectar duplicados com IA
            </h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              A IA analisa os <strong>{uniqueProducts.length}</strong> produtos cadastrados e
              detecta automaticamente nomes diferentes para o mesmo item — como abreviações,
              variações de ortografia e nomes parciais.
            </p>
          </div>
          <Button onClick={analyze} disabled={analyzing || productsQ.isLoading} className="gap-2 shrink-0">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? "Analisando…" : "Analisar agora"}
          </Button>
        </div>

        {analyzing && (
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            A IA está lendo e comparando todos os nomes dos produtos…
          </div>
        )}

        {analyzed && pairs.length === 0 && (
          <div className="mt-6 rounded-xl bg-success/10 px-4 py-3 text-sm text-success flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            Nenhum duplicado detectado nos produtos atuais.
          </div>
        )}

        {pairs.length > 0 && (
          <div className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium">{pending.length} pendente(s)</span>
                {merged.length > 0 && <span className="text-success">{merged.length} unido(s)</span>}
                {dismissed.length > 0 && (
                  <span className="text-muted-foreground">{dismissed.length} ignorado(s)</span>
                )}
              </div>
              {pending.length > 1 && (
                <Button size="sm" onClick={mergeAll} disabled={mergingAll} className="gap-1.5">
                  {mergingAll ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Merge className="h-3.5 w-3.5" />
                  )}
                  Unir todos ({pending.length})
                </Button>
              )}
            </div>

            <div className="divide-y rounded-xl border overflow-hidden">
              {pairs.map((pair, i) => (
                <div
                  key={i}
                  className={
                    "px-4 py-4 transition-colors " +
                    (pair.merged
                      ? "bg-success/5"
                      : pair.dismissed
                        ? "bg-muted/30 opacity-50"
                        : "bg-card hover:bg-muted/20")
                  }
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-success shrink-0" />
                        <span className="font-medium text-sm truncate">{pair.keep.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">(manter)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-destructive shrink-0" />
                        <span className="text-sm text-muted-foreground line-through truncate">
                          {pair.remove.name}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">(remover)</span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-4">{pair.reason}</p>
                    </div>

                    {pair.merged ? (
                      <span className="text-xs text-success flex items-center gap-1 shrink-0 pt-1">
                        <Check className="h-3.5 w-3.5" /> Unido
                      </span>
                    ) : pair.dismissed ? (
                      <span className="text-xs text-muted-foreground shrink-0 pt-1">Ignorado</span>
                    ) : (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="ghost" title="Ignorar" onClick={() => dismissPair(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                        <Button size="sm" onClick={() => mergePair(pair, i)}>
                          <Merge className="h-3.5 w-3.5 mr-1" /> Unir
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              A ação de unir é permanente. Revise cada par antes de confirmar. O produto marcado em
              verde será mantido; o em vermelho será removido.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
