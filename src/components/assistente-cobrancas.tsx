import { useMemo, useState } from "react";
import { AlertCircle, Clock, MessageCircle, X } from "lucide-react";
import { buildWaLink } from "@/lib/whatsapp";

export type Charge = {
  id: string;
  participant_id: string;
  description: string;
  amount: number;
  due_date: string;
  status: "pendente" | "pago" | "vencido" | "cancelado";
  public_token: string;
};
export type Participant = { id: string; name: string; phone: string | null };

type Props = {
  groupName: string;
  participants: Participant[];
  charges: Charge[];
};

const DEFAULT_OVERDUE_MSG =
  "Oi {nome}! Sua cobrança da {grupo} de {valor} venceu em {vencimento}. Pague por aqui: {link}";
const DEFAULT_TOMORROW_MSG =
  "Oi {nome}! Lembrete: sua cobrança da {grupo} de {valor} vence amanhã ({vencimento}). Pague por aqui: {link}";

type Mode = "overdue" | "tomorrow";

export function AssistenteCobrancas({ groupName, participants, charges }: Props) {
  const [openMode, setOpenMode] = useState<Mode | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10);
  }, []);

  const partById = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  const overdue = useMemo(
    () => charges.filter((c) => c.status === "pendente" && c.due_date < today),
    [charges, today]
  );
  const dueTomorrow = useMemo(
    () => charges.filter((c) => c.status === "pendente" && c.due_date === tomorrow),
    [charges, tomorrow]
  );

  if (overdue.length === 0 && dueTomorrow.length === 0) return null;

  return (
    <>
      <section className="bg-white border border-ink/10 rounded-lg p-4">
        <h2 className="font-display text-xl uppercase mb-3">Assistente de Cobranças</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {overdue.length > 0 && (
            <InsightCard
              icon={<AlertCircle className="size-5 text-destructive" />}
              title={`${overdue.length} cobrança${overdue.length > 1 ? "s" : ""} vencida${overdue.length > 1 ? "s" : ""}`}
              subtitle="Deseja enviar lembrete?"
              accent="destructive"
              onAction={() => setOpenMode("overdue")}
            />
          )}
          {dueTomorrow.length > 0 && (
            <InsightCard
              icon={<Clock className="size-5 text-ink" />}
              title={`${dueTomorrow.length} cobrança${dueTomorrow.length > 1 ? "s" : ""} vence${dueTomorrow.length > 1 ? "m" : ""} amanhã`}
              subtitle="Deseja notificar?"
              accent="ink"
              onAction={() => setOpenMode("tomorrow")}
            />
          )}
        </div>
      </section>

      {openMode && (
        <ReminderDialog
          mode={openMode}
          groupName={groupName}
          charges={openMode === "overdue" ? overdue : dueTomorrow}
          partById={partById}
          onClose={() => setOpenMode(null)}
        />
      )}
    </>
  );
}

function InsightCard({
  icon, title, subtitle, accent, onAction,
}: { icon: React.ReactNode; title: string; subtitle: string; accent: "destructive" | "ink"; onAction: () => void }) {
  return (
    <div className={`border rounded-lg p-3 flex items-start gap-3 ${accent === "destructive" ? "border-destructive/20 bg-destructive/5" : "border-ink/15 bg-ink/[0.02]"}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-faded">{subtitle}</p>
      </div>
      <button
        onClick={onAction}
        className="text-[10px] font-bold uppercase tracking-widest border border-ink px-2.5 py-1.5 rounded hover:bg-ink hover:text-paper"
      >
        Enviar
      </button>
    </div>
  );
}

function ReminderDialog({
  mode, groupName, charges, partById, onClose,
}: {
  mode: Mode;
  groupName: string;
  charges: Charge[];
  partById: Map<string, Participant>;
  onClose: () => void;
}) {
  const storageKey = mode === "overdue" ? "peladeiro:msg_overdue" : "peladeiro:msg_tomorrow";
  const defaultMsg = mode === "overdue" ? DEFAULT_OVERDUE_MSG : DEFAULT_TOMORROW_MSG;
  const [template, setTemplate] = useState<string>(() => {
    if (typeof window === "undefined") return defaultMsg;
    return localStorage.getItem(storageKey) ?? defaultMsg;
  });
  const [sent, setSent] = useState<Set<string>>(new Set());

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
  };

  const render = (c: Charge) => {
    const p = partById.get(c.participant_id);
    const link = `${typeof window !== "undefined" ? window.location.origin : ""}/pagar/${c.public_token}`;
    return template
      .replaceAll("{nome}", p?.name ?? "")
      .replaceAll("{grupo}", groupName)
      .replaceAll("{valor}", fmt(Number(c.amount)))
      .replaceAll("{vencimento}", fmtDate(c.due_date))
      .replaceAll("{link}", link);
  };

  const saveTemplate = (v: string) => {
    setTemplate(v);
    try { localStorage.setItem(storageKey, v); } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-paper border-2 border-ink rounded-lg max-w-lg w-full p-6 shadow-ledger max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl uppercase">
              {mode === "overdue" ? "Lembrete de inadimplência" : "Lembrete de vencimento"}
            </h2>
            <p className="font-serif italic text-sm text-faded">{charges.length} cobrança(s)</p>
          </div>
          <button onClick={onClose} className="p-1 text-faded hover:text-ink"><X className="size-5" /></button>
        </div>

        <label className="block mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-faded">Mensagem (editável)</span>
          <textarea
            value={template}
            onChange={(e) => saveTemplate(e.target.value)}
            rows={4}
            className="mt-1 w-full bg-white border border-ink/20 rounded p-2 text-sm font-mono leading-snug"
          />
          <span className="text-[10px] text-faded mt-1 block">
            Placeholders: <code>{"{nome}"}</code> <code>{"{grupo}"}</code> <code>{"{valor}"}</code> <code>{"{vencimento}"}</code> <code>{"{link}"}</code>
          </span>
        </label>

        <ul className="bg-white border border-ink/10 rounded divide-y divide-ink/5 mb-3">
          {charges.map((c) => {
            const p = partById.get(c.participant_id);
            const waUrl = buildWaLink(p?.phone ?? null, render(c));
            const hasPhone = !!waUrl;
            const isSent = sent.has(c.id);
            return (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p?.name ?? "—"}</p>
                  <p className="text-[10px] text-faded truncate">{hasPhone ? p?.phone : "sem telefone"} · {fmt(Number(c.amount))} · vence {fmtDate(c.due_date)}</p>
                </div>
                {hasPhone ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSent((s) => new Set(s).add(c.id))}
                    className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded border ${isSent ? "border-pitch/40 bg-pitch/10 text-pitch" : "border-ink hover:bg-ink hover:text-paper"}`}
                  >
                    <MessageCircle className="size-3" /> {isSent ? "Enviado" : "WhatsApp"}
                  </a>
                ) : (
                  <span className="text-[10px] text-faded uppercase tracking-widest">sem zap</span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end">
          <button onClick={onClose} className="text-xs font-bold uppercase tracking-widest border-2 border-ink px-4 py-2 hover:bg-ink hover:text-paper">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
