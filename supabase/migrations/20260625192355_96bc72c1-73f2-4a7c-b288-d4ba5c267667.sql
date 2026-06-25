
-- Mercados
CREATE TABLE public.markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_color TEXT NOT NULL DEFAULT '#0ea5e9',
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.markets TO anon, authenticated;
GRANT ALL ON public.markets TO service_role;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mercados públicos" ON public.markets FOR SELECT USING (true);

-- Produtos no encarte (uma linha por produto/mercado)
CREATE TABLE public.flyer_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL, -- chave normalizada para comparar (ex: 'arroz-tio-joao-5kg')
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT,
  price NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  valid_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_flyer_products_key ON public.flyer_products(product_key);
CREATE INDEX idx_flyer_products_market ON public.flyer_products(market_id);
GRANT SELECT ON public.flyer_products TO anon, authenticated;
GRANT ALL ON public.flyer_products TO service_role;
ALTER TABLE public.flyer_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Produtos públicos" ON public.flyer_products FOR SELECT USING (true);

-- Itens da lista de compras do usuário
CREATE TABLE public.shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_list_user ON public.shopping_list_items(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO authenticated;
GRANT ALL ON public.shopping_list_items TO service_role;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário gerencia sua lista" ON public.shopping_list_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
