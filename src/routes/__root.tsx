import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ShoppingCart, LogOut, User as UserIcon, ShieldCheck, Menu, X } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Página não encontrada.</p>
        <Link to="/" className="mt-6 inline-block text-primary underline">Voltar ao início</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "root" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tente recarregar a página.</p>
        <Button className="mt-4" onClick={() => { router.invalidate(); reset(); }}>Tentar novamente</Button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EncarteSaqua — Compare preços dos mercados de Saquarema" },
      { name: "description", content: "Compare os encartes dos principais mercados de Saquarema e descubra onde comprar mais barato. Atualizado todos os dias." },
      { property: "og:title", content: "EncarteSaqua — Compare preços em Saquarema" },
      { property: "og:description", content: "Encartes dos 3 maiores mercados de Saquarema lado a lado." },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function Header() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      setEmail(user?.email ?? null);
      if (user) {
        const { data: role } = await supabase
          .from("user_roles").select("role")
          .eq("user_id", user.id).eq("role", "admin").maybeSingle();
        setIsAdmin(!!role);
      } else {
        setIsAdmin(false);
      }
    };
    checkSession();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
        setEmail(session?.user.email ?? null);
        router.invalidate();
        checkSession();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-extrabold text-lg" onClick={() => setMenuOpen(false)}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shrink-0">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <span>EncarteSaqua</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <Link to="/" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted" activeProps={{ className: "px-3 py-2 text-sm font-semibold text-foreground rounded-lg bg-muted" }}>
            Comparar
          </Link>
          {email && (
            <>
              <Link to="/lista" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted" activeProps={{ className: "px-3 py-2 text-sm font-semibold text-foreground rounded-lg bg-muted" }}>
                Minha lista
              </Link>
              <Link to="/perfil" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted" activeProps={{ className: "px-3 py-2 text-sm font-semibold text-foreground rounded-lg bg-muted" }}>
                Perfil
              </Link>
            </>
          )}

          {isAdmin && (
            <Link to="/admin" className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-amber-600 hover:text-amber-700 rounded-lg hover:bg-amber-50" activeProps={{ className: "flex items-center gap-1 px-3 py-2 text-sm font-semibold text-amber-700 rounded-lg bg-amber-50" }}>
              <ShieldCheck className="h-3.5 w-3.5" /> Admin
            </Link>
          )}
          {email ? (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs ml-1">
                <UserIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[120px] truncate">{email}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={signOut} className="ml-1"><LogOut className="h-4 w-4" /></Button>
            </>
          ) : (
            <Button asChild size="sm" className="ml-1"><Link to="/auth">Entrar</Link></Button>
          )}
        </nav>

        {/* Mobile: ações rápidas + hamburguer */}
        <div className="flex items-center gap-2 sm:hidden">
          {email && (
            <Link to="/lista" className="grid h-9 w-9 place-items-center rounded-xl border bg-card text-muted-foreground hover:text-foreground">
              <ShoppingCart className="h-4 w-4" />
            </Link>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-xl border bg-card text-muted-foreground"
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="border-t bg-background px-4 pb-4 pt-2 sm:hidden">
          <div className="flex flex-col gap-1">
            <Link to="/" onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted"
              activeProps={{ className: "flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-foreground bg-muted" }}>
              Comparar preços
            </Link>
            {email && (
              <Link to="/lista" onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted"
                activeProps={{ className: "flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-foreground bg-muted" }}>
                Minha lista de compras
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin" onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-amber-600 hover:bg-amber-50">
                <ShieldCheck className="h-4 w-4" /> Painel Admin
              </Link>
            )}
            <div className="my-2 border-t" />
            {email ? (
              <div className="flex items-center justify-between rounded-xl px-3 py-3 bg-muted/60">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                  <UserIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{email}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={signOut} className="text-destructive hover:text-destructive shrink-0 ml-2">
                  <LogOut className="h-4 w-4 mr-1" /> Sair
                </Button>
              </div>
            ) : (
              <Button asChild className="w-full"><Link to="/auth" onClick={() => setMenuOpen(false)}>Entrar / Criar conta</Link></Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1"><Outlet /></main>
        <footer className="border-t py-5 text-center text-xs text-muted-foreground">
          Encartes atualizados diariamente • Saquarema, RJ
        </footer>
      </div>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
