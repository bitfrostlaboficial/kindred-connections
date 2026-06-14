import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { List, ExternalLink, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildWaLink, buildChargeMessage } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — Peladeiro" }] }),
  component: PagamentosPage,
});

type Group = { id: string; name: string };
type Participant = { id: string; name: string; phone: string | null; group_id: string };
type Charge = {
  id: string;
  group_id: string;
  participant_id: string;
  description: string;
  amount: number;
  due_date: string;
  status: "pendente" | "pago" | "vencido" | "cancelado";
  public_token: string;
  paid_at: string | null;
};

type Tab = "pendentes" | "pagos" | "vencidos";

function PagamentosPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [parts, setParts] = useState<Participant[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("pendentes");
  const [groupFilter, setGroupFilter] = useState<string>("todos");
  const [participantFilter, setParticipantFilter] = useState<string>("todos");
  const [monthFilter, setMonthFilter] = useState<string>(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    (async () => {
      setLoading(true);
      const g = await supabase.from("groups").select("id,name").order("name");
      const gids = (g.data ?? []).map((x: any) => x.id);
      const [p, c] = await Promise.all([
        gids.length
          ? supabase.from("participants").select("id,name,phone,group_id").in("group_id", gids).eq("is_active", true).order("name")
          : Promise.resolve({ data: [] as any[] }),
        gids.length
          ? supabase.from("charges").select("id,group_id,participant_id,description,amount,due_date,status,public_token,paid_at").in("group_id", gids).order("due_date", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
      ]);
      setGroups((g.data ?? []) as Group[]);
      setParts((p.data ?? []) as Participant[]);
      setCharges((c.data ?? []) as Charge[]);
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const partById = useMemo(() => new Map(parts.map((x) => [x.id, x])), [parts]);
  const groupById = useMemo(() => new Map(groups.map((x) => [x.id, x])), [groups]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>(charges.map((c) => c.due_date.slice(0, 7)));
    set.add(new Date().toISOString().slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [charges]);

  const visibleParticipants = useMemo(
    () => (groupFilter === "todos" ? parts : parts.filter((p) => p.group_id === groupFilter)),
    [parts, groupFilter]
  );

  const visible = useMemo(() => {
    return charges.filter((c) => {
      if (groupFilter !== "todos" && c.group_id !== groupFilter) return false;
      if (participantFilter !== "todos" && c.participant_id !== participantFilter) return false;
      if (c.due_date.slice(0, 7) !== monthFilter) return false;
      const eff = c.status === "pendente" && c.due_date < today ? "vencido" : c.status;
      if (tab === "pendentes" && eff !== "pendente") return false;
      if (tab === "pagos" && eff !== "pago") return false;
      if (tab === "vencidos" && eff !== "vencido") return false;
      return true;
    });
  }, [charges, groupFilter, participantFilter, monthFilter, tab, today]);

  const totals = useMemo(() => {
    let pendentes = 0, pagos = 0, vencidos = 0;
    for (const c of charges) {
      if (groupFilter !== "todos" && c.group_id !== groupFilter) continue;
      if (participantFilter !== "todos" && c.participant_id !== participantFilter) continue;
      if (c.due_date.slice(0, 7) !== monthFilter) continue;
      const eff = c.status === "pendente" && c.due_date < today ? "vencido" : c.status;
      if (eff === "pendente") pendentes += Number(c.amount);
      else if (eff === "pago") pagos += Number(c.amount);
      else if (eff === "vencido") vencidos += Number(c.amount);
    }
    return { pendentes, pagos, vencidos };
  }, [charges, groupFilter, participantFilter, monthFilter, today]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" }).toUpperCase();
  };
  const linkOf = (token: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/pagar/${token}`;

  if (loading) {
    return <main className="max-w-6xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando pagamentos...</main>;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <header className="mb-8 border-b-2 border-ink/10 pb-6">
        <h1 className="font-display text-5xl uppercase">Pagamentos</h1>
        <p className="font-serif italic text-faded mt-1">Visão global de todas as suas peladas</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-ink/10 rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-faded">Pendentes</p>
          <p className="font-display text-3xl mt-1 tabular-nums">{fmt(totals.pendentes)}</p>
        </div>
        <div className="bg-white border border-ink/10 rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pitch">Pagos</p>
          <p className="font-display text-3xl mt-1 tabular-nums text-pitch">{fmt(totals.pagos)}</p>
        </div>
        <div className="bg-white border border-ink/10 rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-destructive">Vencidos</p>
          <p className="font-display text-3xl mt-1 tabular-nums text-destructive">{fmt(totals.vencidos)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="inline-flex items-center gap-2 bg-white border border-ink/15 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
          <List className="size-3.5 text-faded" />
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="bg-transparent outline-none cursor-pointer pr-1">
            {availableMonths.map((m) => (<option key={m} value={m}>{monthLabel(m)}</option>))}
          </select>
        </label>
        <select value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setParticipantFilter("todos"); }} className="bg-white border border-ink/15 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest outline-none cursor-pointer">
          <option value="todos">Todas as peladas</option>
          {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
        </select>
        <select value={participantFilter} onChange={(e) => setParticipantFilter(e.target.value)} className="bg-white border border-ink/15 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest outline-none cursor-pointer">
          <option value="todos">Todos os jogadores</option>
          {visibleParticipants.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
        <div className="ml-auto inline-flex rounded-full border border-ink/15 overflow-hidden text-[10px] font-bold uppercase tracking-widest">
          {(["pendentes", "vencidos", "pagos"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 ${tab === t ? "bg-ink text-paper" : "bg-white text-faded hover:bg-ink/5"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-ink/10 bg-ink/[0.03] font-bold text-[10px] uppercase tracking-widest text-faded">
          <div className="col-span-4">Jogador</div>
          <div className="col-span-3 hidden md:block">Pelada</div>
          <div className="col-span-2 hidden md:block">Vence</div>
          <div className="col-span-2">Valor</div>
          <div className="col-span-12 md:col-span-1 text-right">Ações</div>
        </div>
        {visible.length === 0 ? (
          <div className="p-8 text-center font-serif italic text-faded text-sm">Nenhuma cobrança encontrada.</div>
        ) : visible.map((c) => {
          const part = partById.get(c.participant_id);
          const grp = groupById.get(c.group_id);
          const url = linkOf(c.public_token);
          const waUrl = buildWaLink(part?.phone ?? null, buildChargeMessage({
            name: part?.name ?? "",
            groupName: grp?.name ?? "",
            amount: Number(c.amount),
            paymentUrl: url,
          }));
          return (
            <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-ink/5 items-center hover:bg-paper/50">
              <div className="col-span-4 min-w-0">
                <p className="font-semibold text-sm truncate">{part?.name ?? "—"}</p>
                <p className="text-[10px] text-faded truncate">{c.description}</p>
              </div>
              <div className="col-span-3 hidden md:block min-w-0">
                <Link to="/grupos/$groupId" params={{ groupId: c.group_id }} className="text-xs text-faded hover:text-ink truncate block">
                  {grp?.name ?? "—"}
                </Link>
              </div>
              <div className="col-span-2 text-xs font-mono text-faded hidden md:block">{fmtDate(c.due_date)}</div>
              <div className="col-span-2 text-sm font-bold tabular-nums">{fmt(Number(c.amount))}</div>
              <div className="col-span-12 md:col-span-1 flex items-center justify-end gap-1">
                <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir link" className="p-1.5 rounded hover:bg-ink/5 text-faded hover:text-ink">
                  <ExternalLink className="size-3.5" />
                </a>
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp" className="p-1.5 rounded hover:bg-ink/5 text-faded hover:text-[#25D366]">
                    <MessageCircle className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
