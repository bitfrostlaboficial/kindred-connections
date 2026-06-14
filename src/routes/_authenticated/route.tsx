import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const [fullName, setFullName] = useState<string>("");

  useEffect(() => {
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.full_name) setFullName(data.full_name);
    });
  }, [user.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <nav className="border-b-2 border-ink/10 bg-paper sticky top-0 z-40 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link to="/grupos" className="flex items-center gap-3">
            <div className="size-8 bg-pitch rounded-sm rotate-3 flex items-center justify-center text-canarinho font-display text-xl shadow-sm">P</div>
            <span className="font-display text-xl tracking-tight hidden sm:inline">PELADEIRO</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/grupos" className="text-xs font-bold uppercase tracking-widest text-faded hover:text-ink hidden sm:inline" activeProps={{ className: "text-xs font-bold uppercase tracking-widest text-ink hidden sm:inline" }}>Organizo</Link>
            <Link to="/minhas-peladas" className="text-xs font-bold uppercase tracking-widest text-faded hover:text-ink" activeProps={{ className: "text-xs font-bold uppercase tracking-widest text-ink" }}>Participo</Link>
            <Link to="/pagamentos" className="text-xs font-bold uppercase tracking-widest text-faded hover:text-ink hidden sm:inline" activeProps={{ className: "text-xs font-bold uppercase tracking-widest text-ink hidden sm:inline" }}>Pagamentos</Link>
            <Link to="/perfil" className="text-xs font-bold uppercase tracking-widest text-faded hover:text-ink" activeProps={{ className: "text-xs font-bold uppercase tracking-widest text-ink" }}>Perfil</Link>
            <span className="font-serif italic text-sm text-faded hidden md:inline">Olá, {fullName || "organizador"}</span>
            <button onClick={signOut} className="text-xs font-bold uppercase tracking-widest hover:text-destructive">Sair</button>
          </div>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}