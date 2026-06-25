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
import { ShoppingCart, LogOut, User as UserIcon } from "lucide-react";

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
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setEmail(session?.user.email ?? null);
        router.invalidate();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-extrabold text-lg">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <span>EncarteSaqua</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-sm font-semibold text-foreground" }}>
            Comparar
          </Link>
          {email ? (
            <>
              <Link to="/lista" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" activeProps={{ className: "px-3 py-2 text-sm font-semibold text-foreground" }}>
                Minha lista
              </Link>
              <div className="hidden items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs sm:flex">
                <UserIcon className="h-3.5 w-3.5" /> {email}
              </div>
              <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
            </>
          ) : (
            <Button asChild size="sm"><Link to="/auth">Entrar</Link></Button>
          )}
        </nav>
      </div>
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
        <footer className="border-t py-6 text-center text-xs text-muted-foreground">
          Encartes atualizados diariamente • Saquarema, RJ
        </footer>
      </div>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
