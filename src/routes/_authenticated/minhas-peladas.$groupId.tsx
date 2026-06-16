import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Users, MessageCircle, Receipt, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/minhas-peladas/$groupId")({
  head: () => ({ meta: [{ title: "Pelada — Peladeiro" }] }),
  component: PlayerGroupView,
});

type Group = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  group_link: string | null;
  group_link_label: string | null;
  group_link_access: string;
};
type Participant = {
  id: string;
  name: string;
  position: string | null;
  jersey_number: number | null;
  user_id: string | null;
};

function PlayerGroupView() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"escalacao" | "grupo">("escalacao");
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [organizer, setOrganizer] = useState<string>("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const member = await supabase
        .from("participants")
        .select("id")
        .eq("group_id", groupId)
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!member.data) {
        navigate({ to: "/minhas-peladas" });
        return;
      }
      setIsMember(true);

      const g = await supabase
        .from("groups")
        .select("id,name,description,created_by,group_link,group_link_label,group_link_access")
        .eq("id", groupId)
        .maybeSingle();
      if (!g.data) {
        navigate({ to: "/minhas-peladas" });
        return;
      }
      setGroup(g.data as Group);

      const [p, parts] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", g.data.created_by).maybeSingle(),
        supabase
          .from("participants")
          .select("id,name,position,jersey_number,user_id")
          .eq("group_id", groupId)
          .eq("is_active", true)
          .order("name"),
      ]);
      setOrganizer(p.data?.full_name ?? "Organizador");
      setParticipants((parts.data ?? []) as Participant[]);
      setLoading(false);
    })();
  }, [groupId, navigate]);

  if (loading)
    return <main className="max-w-3xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;
  if (!group || !isMember) return null;

  const canSeeLink = group.group_link && group.group_link_access !== "private";

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <Link to="/minhas-peladas" className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-faded hover:text-ink mb-4">
        <ArrowLeft className="size-3" /> Minhas peladas
      </Link>

      <header className="border-b-2 border-ink/10 pb-6 mb-6">
        <p className="font-serif italic text-faded text-sm">Organizada por {organizer}</p>
        <h1 className="font-display text-5xl uppercase leading-none mt-1">{group.name}</h1>
        {group.description && <p className="font-serif italic text-faded mt-2">{group.description}</p>}
        <div className="flex flex-wrap gap-2 mt-4">
          <Link
            to="/minhas-cobrancas"
            search={{ groupId: group.id } as any}
            className="inline-flex items-center gap-2 bg-pitch text-paper px-4 py-2 font-display text-sm uppercase tracking-wide"
          >
            <Receipt className="size-4" /> Minhas cobranças
          </Link>
        </div>
      </header>

      <div className="flex gap-1 border-b border-ink/10 mb-6">
        {[
          { id: "escalacao" as const, label: "Escalação" },
          { id: "grupo" as const, label: "Grupo da pelada" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 -mb-px " +
              (tab === t.id ? "border-pitch text-ink" : "border-transparent text-faded hover:text-ink")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "escalacao" && (
        <section>
          <div className="flex items-center gap-2 mb-3 text-faded text-xs font-bold uppercase tracking-widest">
            <Users className="size-3" /> {participants.length} jogador{participants.length === 1 ? "" : "es"}
          </div>
          {participants.length === 0 ? (
            <p className="font-serif italic text-faded">Nenhum jogador na escalação ainda.</p>
          ) : (
            <ul className="divide-y divide-ink/10 bg-white border border-ink/10 rounded-lg">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-display text-lg uppercase truncate">{p.name}</p>
                    <p className="font-serif italic text-xs text-faded truncate">
                      {p.position || "Sem posição"}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="text-faded text-[10px] uppercase tracking-widest">Camisa</span>
                    <p className="font-display text-xl leading-none">{p.jersey_number ?? "—"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-faded font-serif italic mt-3">Apenas o organizador pode editar a escalação.</p>
        </section>
      )}

      {tab === "grupo" && (
        <section>
          <div className="flex items-center gap-2 mb-3 text-faded text-xs font-bold uppercase tracking-widest">
            <MessageCircle className="size-3" /> Grupo da pelada
          </div>
          {canSeeLink ? (
            <a
              href={group.group_link!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white border-2 border-ink px-4 py-3 font-display uppercase hover:bg-ink hover:text-paper"
            >
              <ExternalLink className="size-4" />
              {group.group_link_label || "Abrir grupo"}
            </a>
          ) : group.group_link && group.group_link_access === "private" ? (
            <p className="font-serif italic text-faded">
              O acesso a este grupo é privado. Fale com o organizador.
            </p>
          ) : (
            <p className="font-serif italic text-faded">
              O organizador ainda não cadastrou o grupo (WhatsApp, Telegram ou Discord).
            </p>
          )}
        </section>
      )}
    </main>
  );
}
