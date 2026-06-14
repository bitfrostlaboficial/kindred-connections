import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type MouseEvent, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getProvider } from "@/lib/payments";
import { toast } from "sonner";
import { buildWaLink, buildChargeMessage } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/grupos/$groupId_/cobrar")({
  head: () => ({ meta: [{ title: "Nova cobrança — Peladeiro" }] }),
  component: NewChargePage,
});

type Participant = { id: string; name: string; phone: string | null };
type Group = { id: string; name: string; default_monthly_fee: number | null; pix_key: string | null; pix_recipient_name: string | null };
type ProviderId = "pix_manual" | "mercado_pago";
type MPCharge = { id: string; participant_id: string; participant_name: string; amount: number; description: string; status: string; pix_copy_paste: string | null; pix_qr_code: string | null; payment_link: string | null; public_token: string; error?: string };

function logNavigationEnvironment(source: string) {
  const env = {
    source,
    host: window.location.host,
    isLovablePreview: window.location.host.includes("lovable.app"),
    isIframe: false,
    sandbox: null as string | null,
    allowPopups: null as boolean | null,
    allowPopupsToEscapeSandbox: null as boolean | null,
  };

  try {
    env.isIframe = window.self !== window.top;
  } catch {
    env.isIframe = true;
  }

  try {
    const frame = window.frameElement as HTMLIFrameElement | null;
    const sandbox = frame?.getAttribute("sandbox") ?? null;
    env.sandbox = sandbox;
    env.allowPopups = sandbox ? sandbox.split(/\s+/).includes("allow-popups") : null;
    env.allowPopupsToEscapeSandbox = sandbox ? sandbox.split(/\s+/).includes("allow-popups-to-escape-sandbox") : null;
  } catch {
    env.sandbox = "inaccessible";
  }

  console.log("NAVIGATION_ENVIRONMENT", env);
  return env;
}

function openWhatsappDirect(url: string, source: string, onManualFallback?: (url: string) => void) {
  console.log("WHATSAPP_WINDOW_OPEN_DIRECT", { source, url });
  logNavigationEnvironment(source);
  try {
    const result = window.open(url, "_blank");
    console.log("WINDOW_OPEN_RETURN", { source, result });
    try { if (result) result.opener = null; } catch { /* noop */ }

    if (!result) {
      console.warn("WINDOW_OPEN_RETURN_NULL", { source, url });
      onManualFallback?.(url);
      console.log("WHATSAPP_LOCATION_HREF_FALLBACK", url);
      window.location.href = url;
      return false;
    }

    return true;
  } catch (e) {
    console.error("WHATSAPP_WINDOW_OPEN_ERROR", e);
    onManualFallback?.(url);
    try {
      console.log("WHATSAPP_LOCATION_HREF_FALLBACK", url);
      window.location.href = url;
    } catch (locationError) {
      console.error("WHATSAPP_LOCATION_HREF_ERROR", locationError);
      toast.error("Não foi possível abrir automaticamente. Use o link manual exibido na tela.");
    }
    return false;
  }
}

function openGoogleNavigationTest(onManualFallback?: (url: string) => void) {
  const url = "https://google.com";
  const source = "google_window_open_test";
  console.log("GOOGLE_WINDOW_OPEN_TEST_CLICKED", { url });
  logNavigationEnvironment(source);
  try {
    const result = window.open(url, "_blank");
    console.log("WINDOW_OPEN_RETURN", { source, result });
    try { if (result) result.opener = null; } catch { /* noop */ }
    if (!result) {
      console.warn("GOOGLE_WINDOW_OPEN_RETURN_NULL", { url });
      onManualFallback?.(url);
      console.log("GOOGLE_LOCATION_HREF_FALLBACK", url);
      window.location.href = url;
    }
  } catch (error) {
    console.error("GOOGLE_WINDOW_OPEN_ERROR", error);
    onManualFallback?.(url);
  }
}

function logWhatsappFlowError(error: unknown) {
  console.error("WHATSAPP_FLOW_ERROR", error);
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  toast.error(`Não foi possível abrir o WhatsApp. ${message}`);
}

function paymentUrlOf(publicToken: string | null | undefined) {
  if (!publicToken) return null;
  return `${typeof window !== "undefined" ? window.location.origin : ""}/pagar/${publicToken}`;
}

function whatsappUrlForCharge(charge: MPCharge, participants: Participant[], groupName: string) {
  console.log("CHARGE_LOADED", { chargeId: charge.id, participantId: charge.participant_id });
  if (charge.error) throw new Error(charge.error);

  const paymentUrl = paymentUrlOf(charge.public_token);
  if (!paymentUrl) throw new Error("Link público da cobrança não encontrado.");
  console.log("PUBLIC_LINK_FOUND", paymentUrl);

  const phone = participants.find((p) => p.id === charge.participant_id)?.phone ?? null;
  console.log("PLAYER_PHONE", phone ?? "");
  if (!phone) throw new Error(`Telefone de ${charge.participant_name} não cadastrado.`);

  const message = buildChargeMessage({ name: charge.participant_name, groupName, amount: charge.amount, paymentUrl });
  console.log("WHATSAPP_MESSAGE_CREATED", message);

  const url = buildWaLink(phone, message);
  if (!url) throw new Error("URL do WhatsApp não pôde ser criada.");
  console.log("WHATSAPP_URL_CREATED", url);
  return url;
}

function NewChargePage() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("mercado_pago");
  const [results, setResults] = useState<MPCharge[] | null>(null);

  useEffect(() => {
    const ref = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const defaultDesc = `Mensalidade ${ref}`;
    Promise.all([
      supabase.from("groups").select("id,name,default_monthly_fee,pix_key,pix_recipient_name").eq("id", groupId).maybeSingle(),
      supabase.from("participants").select("id,name,phone").eq("group_id", groupId).eq("is_active", true).order("name"),
      supabase.from("charges").select("participant_id,description,status").eq("group_id", groupId),
    ]).then(([g, p, c]) => {
      if (g.data) {
        setGroup(g.data as Group);
        if (g.data.default_monthly_fee) setAmount(String(g.data.default_monthly_fee));
        setDescription(defaultDesc);
      }
      const list = (p.data ?? []) as Participant[];
      setParticipants(list);
      // Pré-seleciona apenas quem ainda não pagou a descrição atual
      const paidIds = new Set(((c.data ?? []) as Array<{ participant_id: string; description: string; status: string }>)
        .filter((x) => x.status === "pago" && x.description === defaultDesc)
        .map((x) => x.participant_id));
      setSelected(new Set(list.filter((x) => !paidIds.has(x.id)).map((x) => x.id)));
    });
  }, [groupId]);

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const toggleAll = () => setSelected(selected.size === participants.length ? new Set() : new Set(participants.map((p) => p.id)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) return toast.error("Selecione ao menos um jogador");
    if (!group) return;
    setSaving(true);

    if (provider === "mercado_pago") {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Sessão expirada. Entre novamente.");

        const res = await fetch("/api/charges", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            groupId,
            participantIds: Array.from(selected),
            description,
            amount: Number(amount),
            dueDate,
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `Erro HTTP ${res.status}`);

        const charges = (json.charges ?? []) as MPCharge[];
        const okCount = charges.filter((c) => !c.error).length;
        if (okCount > 0) toast.success(`${okCount} cobrança(s) gerada(s) no Mercado Pago`);
        const errs = charges.filter((c) => c.error);
        if (errs.length > 0) toast.error(`Falha em ${errs.length}: ${errs[0].error}`);
        setResults(charges);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao gerar cobrança";
        toast.error(`Não foi possível gerar a cobrança. ${msg}`);
      } finally {
        setSaving(false);
      }
      return;
    }


    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const pixProvider = getProvider({
      provider: "pix_manual",
      config: { pix_key: group.pix_key ?? "", recipient_name: group.pix_recipient_name ?? "" },
    });

    const inserts = Array.from(selected).map((participant_id) => ({
      group_id: groupId,
      participant_id,
      description,
      amount: Number(amount),
      due_date: dueDate,
      status: "pendente" as const,
      provider: "pix_manual" as const,
      created_by: userId,
    }));

    const { data: inserted, error } = await supabase.from("charges").insert(inserts).select();
    if (error || !inserted) { toast.error(error?.message ?? "Erro"); setSaving(false); return; }

    // Gera Pix copia-e-cola para cada (se chave configurada)
    if (group.pix_key && group.pix_recipient_name) {
      await Promise.all(inserted.map(async (c) => {
        const part = participants.find((p) => p.id === c.participant_id);
        const res = await pixProvider.createCharge({
          amount: Number(c.amount),
          description: c.description,
          dueDate: c.due_date,
          payerName: part?.name ?? "Jogador",
          externalId: c.id,
        });
        await supabase.from("charges").update({
          pix_copy_paste: res.pixCopyPaste,
          provider_charge_id: res.providerChargeId,
        }).eq("id", c.id);
      }));
    }

    toast.success(`${inserted.length} cobrança(s) criada(s)`);
    navigate({ to: "/grupos/$groupId", params: { groupId } });
  };

  if (!group) return <main className="max-w-3xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Link to="/grupos/$groupId" params={{ groupId }} className="font-serif italic text-sm text-faded hover:text-pitch">← Voltar para súmula</Link>
      <h1 className="font-display text-5xl uppercase mt-2 mb-1">Nova cobrança</h1>
      <p className="font-serif italic text-faded mb-8">{group.name}</p>

      <form onSubmit={submit} className="space-y-6 bg-white border-2 border-ink shadow-ledger-soft p-6">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest">Forma de cobrança</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button type="button" onClick={() => setProvider("mercado_pago")} className={`p-3 border-2 text-left ${provider === "mercado_pago" ? "border-pitch bg-pitch/5" : "border-ink/15"}`}>
              <div className="font-display text-lg">MERCADO PAGO</div>
              <div className="text-[10px] text-faded uppercase tracking-widest">Pix automático + webhook</div>
            </button>
            <button type="button" onClick={() => setProvider("pix_manual")} className={`p-3 border-2 text-left ${provider === "pix_manual" ? "border-pitch bg-pitch/5" : "border-ink/15"}`}>
              <div className="font-display text-lg">PIX MANUAL</div>
              <div className="text-[10px] text-faded uppercase tracking-widest">Sua chave Pix</div>
            </button>
            <button type="button" disabled className="p-3 border-2 border-ink/10 text-left opacity-50 cursor-not-allowed relative">
              <div className="font-display text-lg">ASAAS</div>
              <div className="text-[10px] text-faded uppercase tracking-widest">Pix, boleto e cartão</div>
              <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-widest bg-canarinho text-ink px-1.5 py-0.5">Em breve</span>
            </button>
            <button type="button" disabled className="p-3 border-2 border-ink/10 text-left opacity-50 cursor-not-allowed relative">
              <div className="font-display text-lg">INFINITEPAY</div>
              <div className="text-[10px] text-faded uppercase tracking-widest">Pix e link de pagamento</div>
              <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-widest bg-canarinho text-ink px-1.5 py-0.5">Em breve</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-[10px] font-bold uppercase tracking-widest">Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required className="w-full mt-1 px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest">Valor (R$)</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} required type="number" step="0.01" min="0" className="w-full mt-1 px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none font-display text-2xl" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest">Vencimento</label>
            <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} required type="date" className="w-full mt-1 px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold uppercase tracking-widest">Jogadores ({selected.size}/{participants.length})</label>
            <button type="button" onClick={toggleAll} className="text-xs font-bold uppercase tracking-widest text-pitch hover:underline">{selected.size === participants.length ? "Desmarcar todos" : "Marcar todos"}</button>
          </div>
          {participants.length === 0 ? (
            <p className="font-serif italic text-faded text-sm border border-dashed border-ink/20 p-4">Adicione jogadores na escalação primeiro.</p>
          ) : (
            <div className="border-2 border-ink/10 max-h-72 overflow-y-auto divide-y divide-ink/5">
              {participants.map((p) => (
                <label key={p.id} className="flex items-center gap-3 p-3 hover:bg-paper cursor-pointer">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="size-4 accent-pitch" />
                  <span className="text-sm font-bold">{p.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {provider === "pix_manual" && !group.pix_key && (
          <div className="border-2 border-canarinho bg-canarinho/10 p-3 text-xs">
            <strong>Atenção:</strong> Configure a chave Pix da pelada para gerar o copia-e-cola automaticamente. A cobrança será criada mesmo assim.
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          onClick={(event) => console.log("WHATSAPP_BUTTON_CLICKED", { source: "submit_button_click", disabled: event.currentTarget.disabled, pointerEvents: window.getComputedStyle(event.currentTarget).pointerEvents })}
          className="w-full bg-pitch text-paper py-3 font-display text-xl tracking-wide shadow-ledger disabled:opacity-50"
        >
          {saving ? "GERANDO..." : `GERAR ${selected.size} COBRANÇA${selected.size === 1 ? "" : "S"}`}
        </button>
      </form>

      {results && (
        <ChargesResultModal
          charges={results}
          participants={participants}
          groupName={group.name}
          onClose={() => { setResults(null); navigate({ to: "/grupos/$groupId", params: { groupId } }); }}
        />
      )}
    </main>
  );
}

function ChargesResultModal({ charges, participants, groupName, onClose }: { charges: MPCharge[]; participants: Participant[]; groupName: string; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [manualFallbackUrl, setManualFallbackUrl] = useState<string | null>(null);
  const c = charges[idx];
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const phoneOf = (pid: string) => participants.find((p) => p.id === pid)?.phone ?? null;

  const okCharges = charges.filter((x) => !x.error);
  const firstOk = okCharges[0];

  const sendChargeOnWhatsapp = (charge: MPCharge | undefined, source: string, event: MouseEvent<HTMLButtonElement>) => {
    console.log("WHATSAPP_BUTTON_CLICKED", { source, chargeId: charge?.id ?? null, disabled: event.currentTarget.disabled });
    try {
      if (!charge) throw new Error("Nenhuma cobrança válida para enviar.");
      const url = whatsappUrlForCharge(charge, participants, groupName);
      openWhatsappDirect(url, source, setManualFallbackUrl);
    } catch (error) {
      logWhatsappFlowError(error);
    }
  };

  const copy = async (text: string | null) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success("Pix copiado!");
  };



  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-ink shadow-ledger max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b-2 border-ink/10">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-faded">Cobrança {idx + 1} de {charges.length}</div>
            <div className="font-display text-2xl uppercase">{c.participant_name}</div>
          </div>
          <button onClick={onClose} className="text-2xl px-2">×</button>
        </div>
        <div className="p-6 space-y-4">
          {manualFallbackUrl && (
            <div className="border-2 border-canarinho bg-canarinho/10 p-3 text-center text-sm">
              <div className="font-bold uppercase tracking-widest text-[10px] mb-2">Não foi possível abrir automaticamente.</div>
              <a href={manualFallbackUrl} target="_blank" rel="noopener noreferrer" className="font-display text-lg text-pitch hover:underline">
                Abrir {manualFallbackUrl.includes("wa.me") ? "WhatsApp" : "teste"} ↗
              </a>
            </div>
          )}

          {firstOk ? (
            <button
              type="button"
              onClick={(e) => {
                sendChargeOnWhatsapp(firstOk, "modal_send_first", e);
                if (okCharges.length > 1) {
                  toast.message(`Abrindo ${firstOk?.participant_name}. Use os botões abaixo para os outros ${okCharges.length - 1}.`);
                }
              }}
              className="block text-center w-full bg-[#25D366] text-white py-3 font-display text-lg tracking-wide shadow-ledger hover:opacity-90 transition-opacity"
            >
              ENVIAR {okCharges.length > 1 ? `PRIMEIRO (${okCharges.length} TOTAL)` : "PELO WHATSAPP"}
            </button>
          ) : (
            <div className="bg-red-50 border-2 border-red-200 p-3 text-sm text-red-800 text-center">Nenhuma cobrança válida para enviar</div>
          )}

          <button
            type="button"
            onClick={() => openGoogleNavigationTest(setManualFallbackUrl)}
            className="block text-center w-full border-2 border-ink/20 py-2 font-display text-sm tracking-wide hover:border-ink transition-colors"
          >
            TESTE TEMPORÁRIO: ABRIR GOOGLE
          </button>

          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-faded">{c.description}</div>
            <div className="font-display text-5xl text-pitch mt-1">{fmt(c.amount)}</div>
          </div>

          {c.error ? (
            <div className="bg-red-50 border-2 border-red-200 p-3 text-sm text-red-800">
              <strong>Falha:</strong> {c.error}
            </div>
          ) : (
            <>
              {!c.error ? (
                <button
                  type="button"
                  onClick={(e) => sendChargeOnWhatsapp(c, "modal_send_current", e)}
                  className="block text-center w-full bg-[#25D366] text-white py-2 font-display text-base tracking-wide hover:opacity-90 transition-opacity"
                >
                  ENVIAR PARA {c.participant_name.split(" ")[0].toUpperCase()} NO WHATSAPP
                </button>
              ) : (
                <div className="bg-yellow-50 border-2 border-yellow-300 p-2 text-xs text-yellow-900 text-center">Não foi possível gerar o link do WhatsApp</div>
              )}
              {!phoneOf(c.participant_id) && (
                <p className="text-[10px] text-canarinho text-center">⚠ Sem telefone cadastrado — o WhatsApp abrirá sem destinatário.</p>
              )}

              {c.pix_qr_code && (
                <div className="flex justify-center">
                  <img src={`data:image/png;base64,${c.pix_qr_code}`} alt="QR Code Pix" className="size-56 border-2 border-ink/10" />
                </div>
              )}
              {c.pix_copy_paste && (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-faded">Pix Copia e Cola</div>
                  <div className="border-2 border-ink/10 p-3 bg-paper text-xs font-mono break-all max-h-24 overflow-y-auto">{c.pix_copy_paste}</div>
                  <button onClick={() => copy(c.pix_copy_paste)} className="w-full bg-pitch text-paper py-2 font-display text-lg tracking-wide">COPIAR PIX</button>
                </>
              )}
              {c.payment_link && (
                <a href={c.payment_link} target="_blank" rel="noreferrer" className="block text-center border-2 border-pitch text-pitch py-2 font-display text-lg tracking-wide hover:bg-pitch hover:text-paper transition-colors">ABRIR NO MERCADO PAGO ↗</a>
              )}
              <a href={`/pagar/${c.public_token}`} target="_blank" rel="noreferrer" className="block text-center text-xs font-bold uppercase tracking-widest text-faded hover:text-pitch">Link público para o jogador ↗</a>
              <div className="text-center text-[10px] font-bold uppercase tracking-widest text-faded">Status: {c.status}</div>
            </>
          )}
        </div>

        {charges.length > 1 && (
          <div className="flex gap-2 p-4 border-t-2 border-ink/10">
            <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="flex-1 py-2 border border-ink/20 text-xs font-bold uppercase tracking-widest disabled:opacity-30">← Anterior</button>
            <button onClick={() => setIdx((i) => Math.min(charges.length - 1, i + 1))} disabled={idx === charges.length - 1} className="flex-1 py-2 border border-ink/20 text-xs font-bold uppercase tracking-widest disabled:opacity-30">Próximo →</button>
          </div>
        )}
      </div>
    </div>
  );
}
