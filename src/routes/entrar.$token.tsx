import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/entrar/$token")({
  head: () => ({ meta: [{ title: "Entrar na pelada — Peladeiro" }] }),
  component: EntrarPage,
});

type Group = { id: string; name: string };
type Participant = { id: string; name: string; user_id: string | null };

function EntrarPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSignedIn(!!data.session);
      setUserId(data.session?.user.id ?? null);
      setAuthChecked(true);
      if (!data.session) return;

      const g = await supabase.from("groups").select("id,name").eq("invite_token", token).maybeSingle();
      if (!g.data) { setLoading(false); return; }
      setGroup(g.data as Group);

      // already linked?
      const existing = await supabase.from("participants").select("id,name,user_id").eq("group_id", g.data.id).eq("user_id", data.session.user.id).maybeSingle();
      if (existing.data) { navigate({ to: "/minhas-peladas" }); return; }

      const p = await supabase.from("participants").select("id,name,user_id").eq("group_id", g.data.id).is("user_id", null).eq("is_active", true).order("name");
      setParticipants((p.data ?? []) as Participant[]);
      setLoading(false);
    })();
  }, [token, navigate]);

  const claim = async (pid: string) => {
    if (!userId) return;
    setClaiming(pid);
    const { error } = await supabase.from("participants").update({ user_id: userId }).eq("id", pid).is("user_id", null);
    setClaiming(null);
    if (error) return toast.error(error.message);
    toast.success("Pelada vinculada!");
    navigate({ to: "/minhas-peladas" });
  };

  if (!authChecked) return <main className="max-w-md mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;

  if (!signedIn) {
    return (
      <main className="max-w-md mx-auto px-6 py-12 text-center">
        <h1 className="font-display text-4xl uppercase mb-2">Entrar na pelada</h1>
        <p className="font-serif italic text-faded mb-6">Faça login para se vincular à pelada.</p>
        <Link to="/auth" search={{ next: `/entrar/${token}` } as any} className="inline-block bg-pitch text-paper px-6 py-3 font-display text-xl">
          Entrar
        </Link>
      </main>
    );
  }

  if (loading) return <main className="max-w-md mx-auto px-6 py-12 font-serif italic text-faded">Carregando pelada...</main>;

  if (!group) {
    return (
      <main className="max-w-md mx-auto px-6 py-12 text-center">
        <h1 className="font-display text-3xl uppercase mb-2">Pelada não encontrada</h1>
        <p className="font-serif italic text-faded">O link de convite é inválido ou expirou.</p>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-6 py-12">
      <h1 className="font-display text-4xl uppercase">{group.name}</h1>
      <p className="font-serif italic text-faded mt-1 mb-6">Selecione seu nome na lista para se vincular.</p>

      {participants.length === 0 ? (
        <p className="font-serif italic text-faded">Nenhum jogador disponível para vincular. Fale com o organizador.</p>
      ) : (
        <ul className="bg-white border border-ink/10 rounded-lg divide-y divide-ink/5">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">{p.name}</span>
              <button
                onClick={() => claim(p.id)}
                disabled={claiming === p.id}
                className="text-xs font-bold uppercase tracking-widest border-2 border-ink px-3 py-1.5 hover:bg-ink hover:text-paper disabled:opacity-50"
              >
                {claiming === p.id ? "..." : "Sou eu"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
