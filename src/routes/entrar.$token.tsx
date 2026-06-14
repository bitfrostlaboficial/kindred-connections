import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/entrar/$token")({
  head: () => ({ meta: [{ title: "Entrar na pelada — Peladeiro" }] }),
  component: EntrarPage,
});

type Group = { id: string; name: string; description: string | null };

function EntrarPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [group, setGroup] = useState<Group | null>(null);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSignedIn(!!data.session);
      setAuthChecked(true);
      if (!data.session) { setLoading(false); return; }

      const g = await supabase
        .from("groups")
        .select("id,name,description")
        .eq("invite_token", token)
        .maybeSingle();
      if (!g.data) { setLoading(false); return; }
      setGroup(g.data as Group);

      const existing = await supabase
        .from("participants")
        .select("id")
        .eq("group_id", g.data.id)
        .eq("user_id", data.session.user.id)
        .maybeSingle();
      setAlreadyMember(!!existing.data);
      setLoading(false);
    })();
  }, [token]);

  const join = async () => {
    setJoining(true);
    const { data, error } = await supabase.rpc("join_group_by_token", { _token: token });
    setJoining(false);
    if (error) return toast.error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    toast.success(row?.already_member ? "Você já participa desta pelada." : "Você entrou na pelada com sucesso.");
    navigate({ to: "/minhas-peladas" });
  };

  if (!authChecked) return <main className="max-w-md mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;

  if (!signedIn) {
    return (
      <main className="max-w-md mx-auto px-6 py-12 text-center">
        <h1 className="font-display text-4xl uppercase mb-2">Entrar na pelada</h1>
        <p className="font-serif italic text-faded mb-6">Faça login para participar.</p>
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

  if (alreadyMember) {
    return (
      <main className="max-w-md mx-auto px-6 py-12 text-center">
        <h1 className="font-display text-4xl uppercase">{group.name}</h1>
        <p className="font-serif italic text-faded mt-2 mb-6">Você já participa desta pelada.</p>
        <Link to="/minhas-peladas" className="inline-block bg-pitch text-paper px-6 py-3 font-display text-xl uppercase">
          Abrir pelada
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-6 py-12 text-center">
      <h1 className="font-display text-4xl uppercase">{group.name}</h1>
      {group.description && <p className="font-serif italic text-faded mt-1">{group.description}</p>}
      <p className="font-serif italic text-faded mt-6 mb-8">Você deseja participar desta pelada?</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={join}
          disabled={joining}
          className="bg-pitch text-paper px-6 py-3 font-display text-xl uppercase disabled:opacity-50"
        >
          {joining ? "..." : "Participar"}
        </button>
        <Link to="/minhas-peladas" className="border-2 border-ink px-6 py-3 font-display text-xl uppercase">
          Cancelar
        </Link>
      </div>
    </main>
  );
}
