import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/grupos/$groupId_/conferencia")({
  head: () => ({ meta: [{ title: "Conferência — Peladeiro" }] }),
  component: ConferenciaPage,
});

type Group = { id: string; name: string };
type Participant = { id: string; name: string };
type Charge = {
  id: string;
  participant_id: string;
  amount: number;
  due_date: string;
  status: "pendente" | "pago" | "vencido" | "cancelado";
};

type CellStatus = "pago" | "pendente" | "vencido" | "vazio";

function ConferenciaPage() {
  const { groupId } = Route.useParams();
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyDelinquent, setOnlyDelinquent] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [g, p, c] = await Promise.all([
        supabase.from("groups").select("id,name").eq("id", groupId).maybeSingle(),
        supabase.from("participants").select("id,name").eq("group_id", groupId).eq("is_active", true).order("name"),
        supabase.from("charges").select("id,participant_id,amount,due_date,status").eq("group_id", groupId),
      ]);
      if (g.data) setGroup(g.data as Group);
      setParticipants((p.data ?? []) as Participant[]);
      setCharges((c.data ?? []) as Charge[]);
      setLoading(false);
    })();
  }, [groupId]);

  const today = new Date().toISOString().slice(0, 10);

  const months = useMemo(() => {
    const set = new Set<string>(charges.map((c) => c.due_date.slice(0, 7)));
    if (set.size === 0) set.add(new Date().toISOString().slice(0, 7));
    return Array.from(set).sort();
  }, [charges]);

  // matriz: participantId -> month -> {status, count}
  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, { status: CellStatus; count: number; amount: number }>>();
    for (const c of charges) {
      const ym = c.due_date.slice(0, 7);
      const eff: CellStatus = c.status === "pago" ? "pago" : c.status === "pendente" && c.due_date < today ? "vencido" : c.status === "pendente" ? "pendente" : "vazio";
      if (!m.has(c.participant_id)) m.set(c.participant_id, new Map());
      const row = m.get(c.participant_id)!;
      const cur = row.get(ym);
      // priority: vencido > pendente > pago
      const prio = (s: CellStatus) => (s === "vencido" ? 3 : s === "pendente" ? 2 : s === "pago" ? 1 : 0);
      if (!cur || prio(eff) > prio(cur.status)) {
        row.set(ym, { status: eff, count: (cur?.count ?? 0) + 1, amount: (cur?.amount ?? 0) + Number(c.amount) });
      } else {
        row.set(ym, { ...cur, count: cur.count + 1, amount: cur.amount + Number(c.amount) });
      }
    }
    return m;
  }, [charges, today]);

  const isDelinquent = (pid: string) => {
    const row = matrix.get(pid);
    if (!row) return false;
    for (const v of row.values()) if (v.status === "vencido") return true;
    return false;
  };

  const visibleParticipants = useMemo(
    () => (onlyDelinquent ? participants.filter((p) => isDelinquent(p.id)) : participants),
    [participants, onlyDelinquent, matrix]
  );

  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
  };
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const cellCls = (s: CellStatus) =>
    s === "pago"
      ? "bg-pitch/15 text-pitch border-pitch/30"
      : s === "vencido"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : s === "pendente"
      ? "bg-canarinho/30 text-ink border-canarinho/50"
      : "bg-ink/[0.03] text-faded border-ink/10";

  const cellLabel = (s: CellStatus) => (s === "pago" ? "✓" : s === "vencido" ? "!" : s === "pendente" ? "·" : "—");

  if (loading || !group) {
    return <main className="max-w-6xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando conferência...</main>;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <header className="mb-6 border-b-2 border-ink/10 pb-6">
        <Link to="/grupos/$groupId" params={{ groupId }} className="font-serif italic text-sm text-faded hover:text-pitch">
          ← Voltar para súmula
        </Link>
        <h1 className="font-display text-5xl uppercase mt-2">Conferência</h1>
        <p className="font-serif italic text-faded mt-1">{group.name}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest cursor-pointer">
          <input type="checkbox" checked={onlyDelinquent} onChange={(e) => setOnlyDelinquent(e.target.checked)} className="accent-destructive" />
          Só inadimplentes
        </label>
        <div className="ml-auto flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-faded">
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm bg-pitch/30 border border-pitch/40" /> Pago</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm bg-canarinho/40 border border-canarinho/60" /> Pendente</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm bg-destructive/30 border border-destructive/50" /> Vencido</span>
          <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm bg-ink/10 border border-ink/15" /> Sem cobrança</span>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-ink/[0.03] border-b border-ink/10">
              <th className="text-left px-4 py-2.5 font-bold text-[10px] uppercase tracking-widest text-faded sticky left-0 bg-ink/[0.03] z-10">Jogador</th>
              {months.map((m) => (
                <th key={m} className="px-2 py-2.5 font-bold text-[10px] uppercase tracking-widest text-faded text-center min-w-[64px]">{monthLabel(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleParticipants.length === 0 ? (
              <tr><td colSpan={months.length + 1} className="p-8 text-center font-serif italic text-faded">Nenhum jogador.</td></tr>
            ) : visibleParticipants.map((p) => {
              const row = matrix.get(p.id);
              const delinquent = isDelinquent(p.id);
              return (
                <tr key={p.id} className="border-b border-ink/5">
                  <td className="px-4 py-2 sticky left-0 bg-white">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{p.name}</span>
                      {delinquent && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">Inadimplente</span>
                      )}
                    </div>
                  </td>
                  {months.map((m) => {
                    const cell = row?.get(m);
                    const s: CellStatus = cell?.status ?? "vazio";
                    return (
                      <td key={m} className="px-1.5 py-1.5 text-center">
                        <div
                          title={cell ? `${cell.count}x · ${fmt(cell.amount)}` : "Sem cobrança"}
                          className={`mx-auto inline-flex items-center justify-center size-8 rounded border text-xs font-bold tabular-nums ${cellCls(s)}`}
                        >
                          {cellLabel(s)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
