import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, MessageCircle, RefreshCw, List } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildWaLink, buildChargeMessage } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/grupos/$groupId_/links")({
  head: () => ({ meta: [{ title: "Links de Cobrança — Peladeiro" }] }),
  component: LinksPage,
});

type Group = { id: string; name: string };
type Participant = { id: string; name: string; phone: string | null };
type Charge = {
  id: string;
  participant_id: string;
  description: string;
  amount: number;
  due_date: string;
  status: "pendente" | "pago" | "vencido" | "cancelado";
  public_token: string;
};

type StatusFilter = "todos" | "pendente" | "pago" | "vencido";

function LinksPage() {
  const { groupId } = Route.useParams();
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [regenId, setRegenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [g, p, c] = await Promise.all([
      supabase.from("groups").select("id,name").eq("id", groupId).maybeSingle(),
      supabase.from("participants").select("id,name,phone").eq("group_id", groupId).eq("is_active", true).order("name"),
      supabase.from("charges").select("id,participant_id,description,amount,due_date,status,public_token").eq("group_id", groupId).order("due_date", { ascending: false }),
    ]);
    if (g.data) setGroup(g.data as Group);
    setParticipants((p.data ?? []) as Participant[]);
    setCharges((c.data ?? []) as Charge[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId]);

  const today = new Date().toISOString().slice(0, 10);
  const availableMonths = useMemo(() => {
    const set = new Set<string>(charges.map((c) => c.due_date.slice(0, 7)));
    set.add(new Date().toISOString().slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [charges]);

  const visible = useMemo(() => {
    return charges.filter((c) => {
      if (c.due_date.slice(0, 7) !== monthFilter) return false;
      const eff = c.status === "pendente" && c.due_date < today ? "vencido" : c.status;
      if (statusFilter !== "todos" && eff !== statusFilter) return false;
      return true;
    });
  }, [charges, monthFilter, statusFilter, today]);

  const partById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

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

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const regen = async (c: Charge) => {
    if (!window.confirm("Regenerar o link invalida o link atual. Continuar?")) return;
    setRegenId(c.id);
    // gera token de 32 hex (16 bytes) compatível com o default do banco
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const newToken = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await supabase.from("charges").update({ public_token: newToken }).eq("id", c.id);
    setRegenId(null);
    if (error) return toast.error(error.message);
    setCharges((list) => list.map((x) => (x.id === c.id ? { ...x, public_token: newToken } : x)));
    toast.success("Novo link gerado");
  };

  if (loading || !group) {
    return <main className="max-w-6xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando links...</main>;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <header className="mb-8 border-b-2 border-ink/10 pb-6">
        <Link to="/grupos/$groupId" params={{ groupId }} className="font-serif italic text-sm text-faded hover:text-pitch">
          ← Voltar para súmula
        </Link>
        <h1 className="font-display text-5xl uppercase mt-2">Links de Cobrança</h1>
        <p className="font-serif italic text-faded mt-1">{group.name}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="inline-flex items-center gap-2 bg-white border border-ink/15 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-widest hover:border-ink/30 transition-colors cursor-pointer">
          <List className="size-3.5 text-faded" />
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="bg-transparent outline-none cursor-pointer pr-1">
            {availableMonths.map((m) => (<option key={m} value={m}>{monthLabel(m)}</option>))}
          </select>
        </label>
        <div className="inline-flex rounded-full border border-ink/15 overflow-hidden text-[10px] font-bold uppercase tracking-widest">
          {(["todos", "pendente", "pago", "vencido"] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 ${statusFilter === s ? "bg-ink text-paper" : "bg-white text-faded hover:bg-ink/5"}`}>
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-faded font-serif italic">{visible.length} cobrança(s)</span>
      </div>

      <div className="bg-white border border-ink/10 rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-ink/10 bg-ink/[0.03] font-bold text-[10px] uppercase tracking-widest text-faded">
          <div className="col-span-4">Jogador</div>
          <div className="col-span-2 hidden md:block">Vence</div>
          <div className="col-span-2">Valor</div>
          <div className="col-span-2 hidden md:block">Status</div>
          <div className="col-span-12 md:col-span-2 text-right">Ações</div>
        </div>
        {visible.length === 0 ? (
          <div className="p-8 text-center font-serif italic text-faded text-sm">Nenhuma cobrança encontrada.</div>
        ) : visible.map((c) => {
          const part = partById.get(c.participant_id);
          const url = linkOf(c.public_token);
          const isOverdue = c.status === "pendente" && c.due_date < today;
          const eff = isOverdue ? "vencido" : c.status;
          const waUrl = buildWaLink(part?.phone ?? null, buildChargeMessage({
            name: part?.name ?? "",
            groupName: group.name,
            amount: Number(c.amount),
            paymentUrl: url,
          }));
          return (
            <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-ink/5 items-center hover:bg-paper/50 transition-colors">
              <div className="col-span-4 min-w-0">
                <p className="font-semibold text-sm truncate">{part?.name ?? "—"}</p>
                <p className="text-[10px] text-faded truncate">{c.description}</p>
              </div>
              <div className="col-span-2 text-xs font-mono text-faded hidden md:block">{fmtDate(c.due_date)}</div>
              <div className="col-span-2 text-sm font-bold tabular-nums">{fmt(Number(c.amount))}</div>
              <div className="col-span-2 hidden md:block">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${
                  eff === "pago" ? "bg-pitch/10 text-pitch" :
                  eff === "vencido" ? "bg-destructive/10 text-destructive" :
                  eff === "cancelado" ? "bg-ink/10 text-faded" :
                  "bg-canarinho/20 text-ink"
                }`}>{eff}</span>
              </div>
              <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-1">
                <button onClick={() => copy(url)} title="Copiar link" className="p-1.5 rounded hover:bg-ink/5 text-faded hover:text-ink">
                  <Copy className="size-3.5" />
                </button>
                <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir link" className="p-1.5 rounded hover:bg-ink/5 text-faded hover:text-ink">
                  <ExternalLink className="size-3.5" />
                </a>
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" title="Enviar WhatsApp" className="p-1.5 rounded hover:bg-ink/5 text-faded hover:text-[#25D366]">
                    <MessageCircle className="size-3.5" />
                  </a>
                )}
                <button onClick={() => regen(c)} disabled={regenId === c.id} title="Regenerar link" className="p-1.5 rounded hover:bg-ink/5 text-faded hover:text-ink disabled:opacity-50">
                  <RefreshCw className={`size-3.5 ${regenId === c.id ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
