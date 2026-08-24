import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Não derruba o app — deixa a UI mostrar um aviso em vez de tela branca.
  console.warn(
    "VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos. Copie .env.example para .env e preencha."
  );
}

// IMPORTANTE: use sempre a chave "anon" (pública, respeitada pelas policies de RLS).
// A chave "service_role" nunca deve entrar no frontend — ela ignora o RLS inteiro.
export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
