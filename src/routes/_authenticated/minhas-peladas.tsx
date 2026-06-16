import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/minhas-peladas")({
  head: () => ({ meta: [{ title: "Minhas peladas — Peladeiro" }] }),
  component: MinhasPeladasLayout,
});

function MinhasPeladasLayout() {
  const matches = useMatches();
  const hasChild = matches.some((m) => m.routeId !== "/_authenticated/minhas-peladas" && m.routeId.startsWith("/_authenticated/minhas-peladas"));
  if (hasChild) return <Outlet />;
  return <MinhasPeladas />;
}

type Row = { id: string; name: string; description: string | null; participant_id: string };

function MinhasPeladas() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("participants")
        .select("id, group:groups(id,name,description)")
        .eq("user_id", u.user.id)
        .eq("is_active", true);
      const list: Row[] = (data ?? [])
        .filter((r: any) => r.group)
        .map((r: any) => ({ id: r.group.id, name: r.group.name, description: r.group.description, participant_id: r.id }));
      setRows(list);
      setLoading(false);
    })();
  }, []);

  if (loading) return <main className="max-w-3xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <header className="mb-6 border-b-2 border-ink/10 pb-6">
        <h1 className="font-display text-5xl uppercase">Minhas Peladas</h1>
        <p className="font-serif italic text-faded mt-1">Peladas em que você joga</p>
      </header>

      {rows.length === 0 ? (
        <p className="font-serif italic text-faded">Você ainda não está vinculado a nenhuma pelada. Peça o link de convite ao organizador.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="bg-white border border-ink/10 rounded-lg p-4 flex items-center justify-between">
              <div>
                <p className="font-display text-2xl uppercase">{r.name}</p>
                {r.description && <p className="font-serif italic text-sm text-faded">{r.description}</p>}
              </div>
              <Link to="/minhas-cobrancas" search={{ groupId: r.id } as any} className="text-xs font-bold uppercase tracking-widest border-2 border-ink px-3 py-2 hover:bg-ink hover:text-paper">
                Cobranças
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
