import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/entrar/$token")({
  head: () => ({ meta: [{ title: "Entrar na pelada — Peladeiro" }] }),
  component: EntrarPage,
});

type Group = { id: string; name: string; description: string | null; join_mode: string };

function EntrarPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [group, setGroup] = useState<Group | null>(null);
  const [state, setState] = useState<"none" | "member" | "pending">("none");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setSignedIn(!!data.session);
      setAuthChecked(true);
      if (!data.session) { setLoading(false); return; }

      const g = await supabase
        .from("groups")
        .select("id,name,description,join_mode")
        .eq("invite_token", token)
        .maybeSingle();
      if (!g.data) { setLoading(false); return; }
      setGroup(g.data as Group);

      const member = await supabase
        .from("participants").select("id")
        .eq("group_id", g.data.id).eq("user_id", data.session.user.id).maybeSingle();
      if (member.data) { setState("member"); setLoading(false); return; }

      const pend = await supabase
        .from("group_join_requests").select("id")
        .eq("group_id", g.data.id).eq("user_id", data.session.user.id).eq("status", "pending").maybeSingle();
      if (pend.data) setState("pending");
      setLoading(false);
    })();
  }, [token]);

  const act = async () => {
    setActing(true);
    const { data, error } = await supabase.rpc("request_join_by_token", { _token: token });
    setActing(false);
    if (error) return toast.error(error.message);
    const row: any = Array.isArray(data) ? data[0] : data;
    switch (row?.status) {
      case "joined": toast.success("Você entrou na pelada!"); navigate({ to: "/minhas-peladas" }); break;
      case "already_member": setState("member"); break;
      case "pending": toast.success("Solicitação enviada. Aguarde aprovação do organizador."); setState("pending"); break;
      case "invite_only": toast.error("Esta pelada aceita apenas jogadores convidados pelo organizador."); break;
    }
  };

  if (!authChecked) return <main className="max-w-md mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;

  if (!signedIn) {
    return (
      <main className="max-w-md mx-auto px-6 py-12 text-center">
        <h1 className="font-display text-4xl uppercase mb-2">Entrar na pelada</h1>
        <p className="font-serif italic text-faded mb-6">Faça login para participar.</p>
        <Link to="/auth" search={{ next: `/entrar/${token}` } as any} className="inline-block bg-pitch text-paper px-6 py-3 font-display text-xl">Entrar</Link>
      </main>
    );
  }

  if (loading) return <main className="max-w-md mx-auto px-6 py-12 font-serif italic text-faded">Carregando pelada...</main>;
  if (!group) return (
    <main className="max-w-md mx-auto px-6 py-12 text-center">
      <h1 className="font-display text-3xl uppercase mb-2">Pelada não encontrada</h1>
      <p className="font-serif italic text-faded">O link de convite é inválido ou expirou.</p>
    </main>
  );

  if (state === "member") return (
    <main className="max-w-md mx-auto px-6 py-12 text-center">
      <h1 className="font-display text-4xl uppercase">{group.name}</h1>
      <p className="font-serif italic text-faded mt-2 mb-6">Você já participa desta pelada.</p>
      <Link to="/minhas-peladas/$groupId" params={{ groupId: group.id }} className="inline-block bg-pitch text-paper px-6 py-3 font-display text-xl uppercase">Abrir pelada</Link>
    </main>
  );

  if (state === "pending") return (
    <main className="max-w-md mx-auto px-6 py-12 text-center">
      <h1 className="font-display text-4xl uppercase">{group.name}</h1>
      <p className="font-serif italic text-faded mt-2 mb-6">Sua solicitação está aguardando aprovação do organizador.</p>
      <Link to="/minhas-peladas" className="inline-block border-2 border-ink px-6 py-3 font-display text-xl uppercase">Minhas peladas</Link>
    </main>
  );

  const cta = group.join_mode === "approval" ? "Solicitar entrada"
    : group.join_mode === "invite_only" ? "Apenas por convite" : "Participar";

  return (
    <main className="max-w-md mx-auto px-6 py-12 text-center">
      <h1 className="font-display text-4xl uppercase">{group.name}</h1>
      {group.description && <p className="font-serif italic text-faded mt-1">{group.description}</p>}
      <p className="font-serif italic text-faded mt-6 mb-8">
        {group.join_mode === "approval"
          ? "Esta pelada exige aprovação do organizador."
          : group.join_mode === "invite_only"
          ? "Esta pelada aceita apenas jogadores convidados diretamente."
          : "Você deseja participar desta pelada?"}
      </p>
      <div className="flex gap-3 justify-center">
        <button onClick={act} disabled={acting || group.join_mode === "invite_only"}
          className="bg-pitch text-paper px-6 py-3 font-display text-xl uppercase disabled:opacity-50">
          {acting ? "..." : cta}
        </button>
        <Link to="/minhas-peladas" className="border-2 border-ink px-6 py-3 font-display text-xl uppercase">Cancelar</Link>
      </div>
    </main>
  );
}
