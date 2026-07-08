import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, User as UserIcon, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil — EncarteSaqua" }] }),
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: ProfilePage,
});

function normalizePhone(raw: string): string {
  // keep + and digits only
  const cleaned = raw.replace(/[^\d+]/g, "");
  return cleaned;
}

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [optIn, setOptIn] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select("full_name, whatsapp_number, broadcast_opt_in")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setFullName(data.full_name ?? "");
        setWhatsapp(data.whatsapp_number ?? "");
        setOptIn(!!data.broadcast_opt_in);
      }
      setLoading(false);
    };
    load();
  }, []);

  const save = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const user = sess.session?.user;
    if (!user) return;

    const phone = normalizePhone(whatsapp);
    if (optIn && phone.replace(/\D/g, "").length < 10) {
      toast.error("Informe um número de WhatsApp válido para receber os encartes.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      full_name: fullName.trim() || null,
      whatsapp_number: phone || null,
      broadcast_opt_in: optIn,
    });
    setSaving(false);
    if (error) {
      toast.error("Falha ao salvar: " + error.message);
    } else {
      toast.success("Perfil salvo!");
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <UserIcon className="h-7 w-7 text-primary" /> Meu perfil
        </h1>
        <p className="mt-1 text-muted-foreground">
          Cadastre seu WhatsApp para receber o encarte semanal com as melhores ofertas.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)]">
        <div>
          <Label>Email</Label>
          <Input value={email} disabled className="mt-1.5" />
        </div>

        <div>
          <Label htmlFor="name">Nome completo</Label>
          <Input
            id="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Seu nome"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="wpp">WhatsApp (com DDD)</Label>
          <Input
            id="wpp"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+55 22 99999-9999"
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use o formato internacional. Ex.: +55 22 99999-9999
          </p>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-xl border p-4">
          <div>
            <Label htmlFor="opt" className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              Receber encartes por WhatsApp
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Quando você ativa, seu número entra na lista de disparo semanal.
            </p>
          </div>
          <Switch id="opt" checked={optIn} onCheckedChange={setOptIn} />
        </div>

        <Button onClick={save} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar perfil
        </Button>
      </div>
    </div>
  );
}
