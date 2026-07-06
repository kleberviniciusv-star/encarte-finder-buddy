import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMarkets from "./tools/list-markets";
import searchProducts from "./tools/search-products";
import getShoppingList from "./tools/get-shopping-list";
import addShoppingItem from "./tools/add-shopping-item";
import removeShoppingItem from "./tools/remove-shopping-item";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "encartesaqua-mcp",
  title: "EncarteSaqua",
  version: "0.1.0",
  instructions:
    "Ferramentas para comparar preços de encartes de supermercados brasileiros (Juzan, Gomes) e gerenciar a lista de compras do usuário autenticado. Use `search_products` para achar ofertas, `list_markets` para listar mercados, e as ferramentas de shopping list para adicionar/remover itens.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMarkets, searchProducts, getShoppingList, addShoppingItem, removeShoppingItem],
});
