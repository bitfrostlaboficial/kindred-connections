import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Peladeiro" }, { name: "description", content: "Acesse sua conta no Peladeiro." }] }),
  validateSearch: (s: Record<string, unknown>) => ({ next: typeof s.next === "string" ? s.next : undefined }) as { next?: string },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const dest = next || "/grupos";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: dest });
    });
  }, [navigate, dest]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + dest, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Conta criada! Bora começar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: dest });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + dest });
    if (result.error) {
      toast.error("Erro ao entrar com Google");
      setLoading(false);
      return;
    }
    if (!result.redirected) navigate({ to: dest });
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-9 bg-pitch rounded-sm rotate-3 flex items-center justify-center text-canarinho font-display text-2xl">P</div>
          <span className="font-display text-2xl tracking-tight">PELADEIRO</span>
        </Link>

        <div className="bg-white border-2 border-ink shadow-ledger-soft p-8">
          <h1 className="font-display text-4xl uppercase mb-1">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
          <p className="font-serif italic text-sm text-faded mb-6">
            {mode === "signin" ? "Bora dar continuidade na pelada." : "Crie sua conta de organizador em 30 segundos."}
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full py-3 border-2 border-ink font-bold text-sm uppercase tracking-widest hover:bg-ink hover:text-paper transition-colors mb-4 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Continuar com Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-ink/10" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-faded">ou</span>
            <div className="flex-1 h-px bg-ink/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Seu nome" className="w-full px-4 py-3 border-2 border-ink/20 focus:border-pitch outline-none font-body" />
            )}
            <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" placeholder="E-mail" className="w-full px-4 py-3 border-2 border-ink/20 focus:border-pitch outline-none font-body" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} required type="password" minLength={6} placeholder="Senha (mín. 6)" className="w-full px-4 py-3 border-2 border-ink/20 focus:border-pitch outline-none font-body" />
            <button type="submit" disabled={loading} className="w-full bg-pitch text-paper py-3 font-display text-xl tracking-wide hover:bg-ink transition-colors shadow-ledger active:translate-y-0.5 active:shadow-none disabled:opacity-50">
              {loading ? "AGUARDE..." : mode === "signin" ? "ENTRAR" : "CRIAR CONTA"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full mt-4 text-xs font-bold uppercase tracking-widest text-faded hover:text-pitch"
          >
            {mode === "signin" ? "Não tem conta? Criar agora" : "Já tenho conta · Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}