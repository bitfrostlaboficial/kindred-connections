import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Users, MessageCircle, Receipt, ExternalLink, Calendar, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/minhas-peladas/$groupId")({
  head: () => ({ meta: [{ title: "Pelada — Peladeiro" }] }),
  component: PlayerGroupView,
});

type Group = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  cover_image_url: string | null;
  group_link: string | null;
  group_link_label: string | null;
  group_link_access: string;
};
type Participant = {
  id: string; name: string; position: string | null; jersey_number: number | null; user_id: string | null;
};
type Field = { id: string; name: string; address: string | null; maps_url: string | null; photo_url: string | null };
type Game = { id: string; field_id: string | null; title: string | null; scheduled_at: string; duration_minutes: number | null; notes: string | null };
type Charge = { id: string; description: string; amount: number; due_date: string; status: string; public_token: string };
type Profile = { full_name: string | null; nickname: string | null; avatar_url: string | null };

function PlayerGroupView() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"escalacao" | "cobrancas" | "grupo">("escalacao");
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [organizer, setOrganizer] = useState<string>("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [nextGame, setNextGame] = useState<Game | null>(null);
  const [nextField, setNextField] = useState<Field | null>(null);
  const [myCharges, setMyCharges] = useState<Charge[]>([]);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;

      const member = await supabase.from("participants").select("id").eq("group_id", groupId).eq("user_id", u.user.id).maybeSingle();
      if (!member.data) { navigate({ to: "/minhas-peladas" }); return; }
      setMyParticipantId(member.data.id);

      const g = await supabase.from("groups").select("id,name,description,created_by,cover_image_url,group_link,group_link_label,group_link_access").eq("id", groupId).maybeSingle();
      if (!g.data) { navigate({ to: "/minhas-peladas" }); return; }
      setGroup(g.data as Group);

      const [pOrg, parts, games, charges] = await Promise.all([
        supabase.from("profiles").select("full_name,nickname").eq("id", g.data.created_by).maybeSingle(),
        supabase.from("participants").select("id,name,position,jersey_number,user_id").eq("group_id", groupId).eq("is_active", true).order("name"),
        supabase.from("group_games").select("*").eq("group_id", groupId).gte("scheduled_at", new Date(Date.now() - 3 * 3600_000).toISOString()).order("scheduled_at").limit(1),
        supabase.from("charges").select("id,description,amount,due_date,status,public_token").eq("group_id", groupId).eq("participant_id", member.data.id).order("due_date", { ascending: false }),
      ]);

      setOrganizer((pOrg.data as any)?.nickname?.trim() || (pOrg.data as any)?.full_name || "Organizador");
      const list = (parts.data ?? []) as Participant[];
      setParticipants(list);
      setMyCharges((charges.data ?? []) as Charge[]);

      const uids = list.map((p) => p.user_id).filter((x): x is string => !!x);
      if (uids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,full_name,nickname,avatar_url").in("id", uids);
        const map: Record<string, Profile> = {};
        for (const p of (profs ?? []) as any[]) map[p.id] = { full_name: p.full_name, nickname: p.nickname, avatar_url: p.avatar_url };
        setProfiles(map);
      }

      const game = (games.data ?? [])[0] as Game | undefined;
      if (game) {
        setNextGame(game);
        if (game.field_id) {
          const { data: f } = await supabase.from("fields").select("id,name,address,maps_url,photo_url").eq("id", game.field_id).maybeSingle();
          setNextField((f as Field) ?? null);
        }
      }
      setLoading(false);
    })();
  }, [groupId, navigate]);

  if (loading) return <main className="max-w-3xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;
  if (!group) return null;

  const canSeeLink = group.group_link && group.group_link_access !== "private";
  const displayName = (p: Participant) => {
    const prof = p.user_id ? profiles[p.user_id] : null;
    return prof?.nickname?.trim() || prof?.full_name || p.name;
  };
  const initials = (n: string) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const fmtWhen = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
  const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  const pendentes = myCharges.filter((c) => c.status === "pendente");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <Link to="/minhas-peladas" className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-faded hover:text-ink mb-4">
        <ArrowLeft className="size-3" /> Minhas peladas
      </Link>

      {/* Capa */}
      <div className="relative aspect-[16/7] bg-pitch overflow-hidden border-2 border-ink">
        {group.cover_image_url ? (
          <img src={group.cover_image_url} alt={group.name} className="size-full object-cover" />
        ) : (
          <div className="size-full bg-gradient-to-br from-pitch to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 text-paper">
          <p className="font-serif italic text-xs opacity-80">Organizada por {organizer}</p>
          <h1 className="font-display text-4xl md:text-5xl uppercase leading-none">{group.name}</h1>
          {group.description && <p className="font-serif italic text-xs opacity-80 mt-1 line-clamp-2">{group.description}</p>}
        </div>
      </div>

      {/* Próximo jogo */}
      {nextGame && (
        <div className="mt-4 border-2 border-ink bg-white overflow-hidden">
          {nextField?.photo_url && <img src={nextField.photo_url} alt={nextField.name} className="w-full aspect-[16/6] object-cover" />}
          <div className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-pitch font-bold text-[10px] uppercase tracking-widest">
              <Calendar className="size-3" /> Próximo jogo
            </div>
            <p className="font-display text-2xl uppercase">{fmtWhen(nextGame.scheduled_at)}</p>
            {nextGame.title && <p className="font-serif italic text-sm">{nextGame.title}</p>}
            {nextField && (
              <div className="flex items-start gap-2 pt-2 border-t border-ink/10">
                <MapPin className="size-4 text-faded shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{nextField.name}</p>
                  {nextField.address && <p className="text-xs text-faded">{nextField.address}</p>}
                  {nextField.maps_url && <a href={nextField.maps_url} target="_blank" rel="noreferrer" className="text-xs underline text-pitch">Abrir no mapa</a>}
                </div>
              </div>
            )}
            {nextGame.notes && <p className="text-xs text-faded font-serif italic pt-2 border-t border-ink/10">{nextGame.notes}</p>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink/10 mt-6 mb-6">
        {[
          { id: "escalacao" as const, label: "Escalação", count: participants.length },
          { id: "cobrancas" as const, label: "Cobranças", count: pendentes.length },
          { id: "grupo" as const, label: "Comunidade" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={"px-4 py-2 text-xs font-bold uppercase tracking-widest border-b-2 -mb-px " + (tab === t.id ? "border-pitch text-ink" : "border-transparent text-faded hover:text-ink")}>
            {t.label}{t.count != null && ` (${t.count})`}
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
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {participants.map((p) => {
                const prof = p.user_id ? profiles[p.user_id] : null;
                const name = displayName(p);
                const isMe = p.id === myParticipantId;
                return (
                  <li key={p.id} className={"flex items-center gap-3 bg-white border p-3 " + (isMe ? "border-pitch" : "border-ink/10")}>
                    <div className="size-11 rounded-full bg-paper border border-ink/15 overflow-hidden flex items-center justify-center shrink-0">
                      {prof?.avatar_url ? <img src={prof.avatar_url} alt={name} className="size-full object-cover" /> : <span className="font-display text-sm">{initials(name)}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm truncate">{name}{isMe && <span className="ml-1 text-[10px] text-pitch uppercase tracking-widest font-serif italic font-normal">(você)</span>}</p>
                      <p className="font-serif italic text-[11px] text-faded truncate">{p.position || "Sem posição"}</p>
                    </div>
                    {p.jersey_number != null && (
                      <div className="text-right shrink-0">
                        <span className="text-faded text-[9px] uppercase tracking-widest">Camisa</span>
                        <p className="font-display text-lg leading-none">#{p.jersey_number}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-faded font-serif italic mt-3">Apenas o organizador pode editar a escalação.</p>
        </section>
      )}

      {tab === "cobrancas" && (
        <section className="space-y-3">
          {myCharges.length === 0 ? (
            <p className="font-serif italic text-faded">Nenhuma cobrança por aqui.</p>
          ) : (
            <ul className="divide-y divide-ink/10 bg-white border border-ink/10">
              {myCharges.map((c) => {
                const isOverdue = c.status === "pendente" && c.due_date < today;
                const stColor = c.status === "pago" ? "text-pitch" : isOverdue ? "text-destructive" : "text-canarinho";
                const stLabel = c.status === "pago" ? "Pago" : isOverdue ? "Vencido" : "Pendente";
                return (
                  <li key={c.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{c.description}</p>
                      <p className="text-[11px] text-faded">Vence em {fmtDate(c.due_date)} · <span className={`font-bold uppercase ${stColor}`}>{stLabel}</span></p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-3">
                      <p className="font-display text-lg">{fmtMoney(Number(c.amount))}</p>
                      {c.status === "pendente" && (
                        <a href={`/pagar/${c.public_token}`} className="text-[10px] font-bold uppercase tracking-widest bg-pitch text-paper px-3 py-2">Pagar</a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Link to="/minhas-cobrancas" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-pitch hover:underline">
            <Receipt className="size-3" /> Ver todas as cobranças
          </Link>
        </section>
      )}

      {tab === "grupo" && (
        <section>
          <div className="flex items-center gap-2 mb-3 text-faded text-xs font-bold uppercase tracking-widest">
            <MessageCircle className="size-3" /> Comunidade da pelada
          </div>
          {canSeeLink ? (
            <a href={group.group_link!} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-white border-2 border-ink px-4 py-3 font-display uppercase hover:bg-ink hover:text-paper">
              <ExternalLink className="size-4" />
              {group.group_link_label || "Abrir grupo"}
            </a>
          ) : group.group_link && group.group_link_access === "private" ? (
            <p className="font-serif italic text-faded">O acesso a este grupo é privado. Fale com o organizador.</p>
          ) : (
            <p className="font-serif italic text-faded">O organizador ainda não cadastrou o grupo (WhatsApp, Telegram ou Discord).</p>
          )}
        </section>
      )}
    </main>
  );
}
