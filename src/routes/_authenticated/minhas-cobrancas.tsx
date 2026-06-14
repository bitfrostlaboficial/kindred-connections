import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/minhas-cobrancas")({
  head: () => ({ meta: [{ title: "Minhas cobranças — Peladeiro" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ groupId: typeof s.groupId === "string" ? s.groupId : undefined }) as { groupId?: string },
  component: MinhasCobrancas,
});

type Charge = {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  due_date: string;
  status: "pendente" | "pago" | "vencido" | "cancelado";
  public_token: string;
  group?: { name: string } | null;
};

function MinhasCobrancas() {
  const { groupId } = Route.useSearch();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const parts = await supabase.from("participants").select("id").eq("user_id", u.user.id);
      const ids = (parts.data ?? []).map((p: any) => p.id);
      if (!ids.length) { setLoading(false); return; }
      let q = supabase
        .from("charges")
        .select("id,group_id,description,amount,due_date,status,public_token,group:groups(name)")
        .in("participant_id", ids)
        .order("due_date", { ascending: false });
      if (groupId) q = q.eq("group_id", groupId);
      const { data } = await q;
      setCharges((data ?? []) as any);
      setLoading(false);
    })();
  }, [groupId]);

  const today = new Date().toISOString().slice(0, 10);
  const totals = useMemo(() => {
    let pendente = 0, vencido = 0, pago = 0;
    for (const c of charges) {
      const eff = c.status === "pendente" && c.due_date < today ? "vencido" : c.status;
      if (eff === "pendente") pendente += Number(c.amount);
      else if (eff === "vencido") vencido += Number(c.amount);
      else if (eff === "pago") pago += Number(c.amount);
    }
    return { pendente, vencido, pago };
  }, [charges, today]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  };

  if (loading) return <main className="max-w-4xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;

  return (
    <main className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <header className="mb-6 border-b-2 border-ink/10 pb-6">
        <Link to="/minhas-peladas" className="font-serif italic text-sm text-faded hover:text-pitch">← Minhas peladas</Link>
        <h1 className="font-display text-5xl uppercase mt-2">Minhas Cobranças</h1>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-ink/10 rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-faded">Pendente</p>
          <p className="font-display text-2xl mt-1 tabular-nums">{fmt(totals.pendente)}</p>
        </div>
        <div className="bg-white border border-ink/10 rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-destructive">Vencido</p>
          <p className="font-display text-2xl mt-1 tabular-nums text-destructive">{fmt(totals.vencido)}</p>
        </div>
        <div className="bg-white border border-ink/10 rounded-lg p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-pitch">Pago</p>
          <p className="font-display text-2xl mt-1 tabular-nums text-pitch">{fmt(totals.pago)}</p>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
        {charges.length === 0 ? (
          <p className="p-6 text-center font-serif italic text-faded">Nenhuma cobrança.</p>
        ) : charges.map((c) => {
          const eff = c.status === "pendente" && c.due_date < today ? "vencido" : c.status;
          return (
            <div key={c.id} className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-ink/5">
              <div className="col-span-6 min-w-0">
                <p className="font-semibold text-sm truncate">{c.group?.name ?? "—"}</p>
                <p className="text-[11px] text-faded truncate">{c.description} · vence {fmtDate(c.due_date)}</p>
              </div>
              <div className="col-span-3">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${
                  eff === "pago" ? "bg-pitch/10 text-pitch" :
                  eff === "vencido" ? "bg-destructive/10 text-destructive" :
                  eff === "cancelado" ? "bg-ink/10 text-faded" :
                  "bg-canarinho/20 text-ink"
                }`}>{eff}</span>
              </div>
              <div className="col-span-2 text-sm font-bold tabular-nums">{fmt(Number(c.amount))}</div>
              <div className="col-span-1 text-right">
                {eff !== "pago" && eff !== "cancelado" && (
                  <a href={`/pagar/${c.public_token}`} target="_blank" rel="noopener noreferrer" className="inline-flex p-1.5 rounded hover:bg-ink/5 text-faded hover:text-ink" title="Pagar">
                    <ExternalLink className="size-4" />
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
