
-- Remove Atacarejo
DELETE FROM public.flyer_products WHERE market_id = '3972deef-71e7-4413-88ef-731f2bb275b2';
DELETE FROM public.markets WHERE id = '3972deef-71e7-4413-88ef-731f2bb275b2';

-- Add flyer_url + last_synced_at columns
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS flyer_url text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Set real flyer URLs
UPDATE public.markets SET flyer_url = 'https://www.supermercadosjuzan.com.br/encartes'
  WHERE slug = 'juzan';
UPDATE public.markets SET flyer_url = 'https://meuencarte.com.br/gomes.html'
  WHERE slug = 'gomes';

-- Clear mock products so the next scrape replaces them with real data
DELETE FROM public.flyer_products;
