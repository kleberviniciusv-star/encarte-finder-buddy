
-- has_role: SECURITY INVOKER is safe — it only checks the caller's own row,
-- which the SELECT policy on user_roles already permits.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- admin_merge_products stays SECURITY DEFINER (it mutates tables that deny writes),
-- but only trusted server code (service_role) may call it.
REVOKE ALL ON FUNCTION public.admin_merge_products(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_products(text, text) TO service_role;
