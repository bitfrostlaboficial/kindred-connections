import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildWaLink, buildChargeMessage } from "@/lib/whatsapp";
import { connectMercadoPagoManual } from "@/lib/payments/mp-connect.functions";
import { connectStripeManual } from "@/lib/payments/stripe-connect.functions";

type ProviderId = "mercado_pago" | "stripe";

export const Route = createFileRoute("/_authenticated/grupos/$groupId")({
  head: () => ({ meta: [{ title: "Súmula — Peladeiro" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ mp_connected: s.mp_connected === "1" ? "1" : undefined }) as { mp_connected?: "1" },
  component: GroupDashboard,
});

type Group = { id: string; name: string; description: string | null; default_monthly_fee: number | null; pix_key: string | null; pix_recipient_name: string | null };
type Participant = { id: string; name: string; position: string | null; jersey_number: number | null; type: "mensalista" | "avulso"; is_active: boolean; phone: string | null };
type Charge = { id: string; participant_id: string; description: string; amount: number; due_date: string; status: "pendente" | "pago" | "vencido" | "cancelado"; paid_at: string | null; public_token: string; created_at: string };
type PPCInfo = { payment_account_id: string | null; account?: { id: string; account_label: string | null; external_user_id: string | null; is_active: boolean; expires_at: string | null; updated_at: string } | null };

function GroupDashboard() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [group, setGroup] = useState<Group | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [ppc, setPpc] = useState<Record<ProviderId, PPCInfo | null>>({ mercado_pago: null, stripe: null });
  const [connecting, setConnecting] = useState(false);
  const [openModal, setOpenModal] = useState<ProviderId | null>(null);
  const [mpToken, setMpToken] = useState("");
  const [mpPublicKey, setMpPublicKey] = useState("");
  const [stripeSk, setStripeSk] = useState("");
  const [stripePk, setStripePk] = useState("");
  const [stripeWh, setStripeWh] = useState("");
  const connectMPFn = useServerFn(connectMercadoPagoManual);
  const connectStripeFn = useServerFn(connectStripeManual);
  const [loading, setLoading] = useState(true);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [pName, setPName] = useState("");
  const [pPosition, setPPosition] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [ePosition, setEPosition] = useState("");
  const [eJersey, setEJersey] = useState("");
  const [eSaving, setESaving] = useState(false);

  const startEdit = (p: Participant) => {
    setEditingId(p.id);
    setEName(p.name);
    setEPhone(p.phone ?? "");
    setEPosition(p.position ?? "");
    setEJersey(p.jersey_number ? String(p.jersey_number) : "");
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setESaving(true);
    const patch = {
      name: eName.trim(),
      phone: ePhone.trim() || null,
      position: ePosition.trim() || null,
      jersey_number: eJersey.trim() ? Number(eJersey) : null,
    };
    const { error } = await supabase.from("participants").update(patch).eq("id", editingId);
    setESaving(false);
    if (error) return toast.error(error.message);
    setParticipants((list) => list.map((x) => x.id === editingId ? { ...x, ...patch } as Participant : x));
    setEditingId(null);
    toast.success("Jogador atualizado");
  };
  const deletePlayer = async (p: Participant) => {
    if (!window.confirm(`Excluir ${p.name} da escalação?`)) return;
    const { error } = await supabase.from("participants").update({ is_active: false }).eq("id", p.id);
    if (error) return toast.error(error.message);
    setParticipants((list) => list.filter((x) => x.id !== p.id));
    toast.success("Jogador removido");
  };


  const load = async () => {
    const [g, p, c] = await Promise.all([
      supabase.from("groups").select("*").eq("id", groupId).maybeSingle(),
      supabase.from("participants").select("*").eq("group_id", groupId).eq("is_active", true).order("name"),
      supabase.from("charges").select("*").eq("group_id", groupId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (g.error || !g.data) { toast.error("Pelada não encontrada"); navigate({ to: "/grupos" }); return; }
    setGroup(g.data as Group);
    setParticipants((p.data ?? []) as Participant[]);
    setCharges((c.data ?? []) as Charge[]);
    await loadFinance();
    setLoading(false);
  };
  const loadFinance = async () => {
    const { data: cfgs } = await supabase
      .from("payment_provider_configs")
      .select("provider, payment_account_id")
      .eq("group_id", groupId)
      .in("provider", ["mercado_pago", "stripe"]);
    const next: Record<ProviderId, PPCInfo | null> = { mercado_pago: null, stripe: null };
    for (const row of (cfgs ?? []) as Array<{ provider: ProviderId; payment_account_id: string | null }>) {
      const accountId = row.payment_account_id ?? null;
      if (!accountId) { next[row.provider] = { payment_account_id: null, account: null }; continue; }
      const { data: acct } = await supabase
        .from("payment_accounts" as any)
        .select("id, account_label, external_user_id, is_active, expires_at, updated_at")
        .eq("id", accountId)
        .maybeSingle();
      next[row.provider] = { payment_account_id: accountId, account: (acct as any) ?? null };
    }
    setPpc(next);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId]);
  useEffect(() => {
    if (search.mp_connected === "1") {
      toast.success("Mercado Pago conectado!");
      navigate({ to: "/grupos/$groupId", params: { groupId }, replace: true });
    }
  }, [search.mp_connected, groupId, navigate]);

  const openMPModal = () => { setMpToken(""); setMpPublicKey(""); setOpenModal("mercado_pago"); };
  const openStripeModal = () => { setStripeSk(""); setStripePk(""); setStripeWh(""); setOpenModal("stripe"); };
  const closeModal = () => { if (!connecting) setOpenModal(null); };

  const submitMP = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    try {
      const res = await connectMPFn({ data: { groupId, accessToken: mpToken, publicKey: mpPublicKey || undefined } });
      toast.success(`Mercado Pago conectado (${res.label})`);
      setOpenModal(null);
      await loadFinance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao conectar Mercado Pago");
    } finally { setConnecting(false); }
  };
  const submitStripe = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    try {
      const res = await connectStripeFn({ data: { groupId, secretKey: stripeSk, publishableKey: stripePk || undefined, webhookSecret: stripeWh || undefined } });
      toast.success(`Stripe conectado (${res.label})`);
      setOpenModal(null);
      await loadFinance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao conectar Stripe");
    } finally { setConnecting(false); }
  };
  const disconnect = async (provider: ProviderId) => {
    const label = provider === "stripe" ? "Stripe" : "Mercado Pago";
    if (!window.confirm(`Desvincular a conta ${label} deste grupo? Cobranças existentes continuam.`)) return;
    const { error } = await supabase
      .from("payment_provider_configs")
      .update({ payment_account_id: null, is_active: false } as any)
      .eq("group_id", groupId)
      .eq("provider", provider);
    if (error) return toast.error(error.message);
    toast.success("Conta desvinculada");
    loadFinance();
  };
    loadFinance();
  };

  const addPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("participants").insert({ group_id: groupId, name: pName, position: pPosition || null, phone: pPhone || null });
    if (error) return toast.error(error.message);
    setPName(""); setPPosition(""); setPPhone(""); setShowAddPlayer(false);
    toast.success("Jogador adicionado");
    load();
  };

  const markPaid = async (chargeId: string) => {
    const { error } = await supabase.from("charges").update({ status: "pago", paid_at: new Date().toISOString() }).eq("id", chargeId);
    if (error) return toast.error(error.message);
    toast.success("Cobrança marcada como paga");
    load();
  };

  if (loading || !group) return <main className="max-w-6xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando súmula...</main>;

  const totalPago = charges.filter((c) => c.status === "pago").reduce((s, c) => s + Number(c.amount), 0);
  const totalPendente = charges.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.amount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = charges.filter((c) => c.status === "pendente" && c.due_date < today);
  const totalVencido = overdue.reduce((s, c) => s + Number(c.amount), 0);
  const pName2id = new Map(participants.map((p) => [p.id, p.name]));

  const statusByParticipant = new Map<string, "em_dia" | "pendente" | "vencido">();
  for (const c of charges) {
    if (c.status === "pago") continue;
    const isOverdue = c.due_date < today;
    const cur = statusByParticipant.get(c.participant_id);
    if (isOverdue) statusByParticipant.set(c.participant_id, "vencido");
    else if (cur !== "vencido") statusByParticipant.set(c.participant_id, "pendente");
  }

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase().replace(/\./g, "");

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-ink/10 pb-6">
        <div>
          <Link to="/grupos" className="font-serif italic text-sm text-faded hover:text-pitch">← Suas peladas</Link>
          <h1 className="font-display text-5xl md:text-6xl uppercase leading-none mt-2">{group.name}</h1>
          {group.description && <p className="font-serif italic text-sm text-faded mt-2">{group.description}</p>}
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/grupos/$groupId/cobrar", params: { groupId } })}
          className="bg-pitch text-paper px-6 py-3 font-display text-xl tracking-wide flex items-center gap-3 hover:bg-ink transition-colors shadow-ledger active:translate-y-0.5 active:shadow-none self-start"
        >
          COBRAR <span className="text-canarinho">+</span>
        </button>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Placar Financeiro */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-0 border-2 border-ink divide-y md:divide-y-0 md:divide-x-2 divide-ink shadow-ledger-soft bg-white">
            <div className="p-6 animate-count">
              <p className="font-serif italic text-sm text-faded mb-1">R$ Coletado</p>
              <p className="font-display text-4xl text-pitch">{fmt(totalPago)}</p>
            </div>
            <div className="p-6 animate-count [animation-delay:100ms]">
              <p className="font-serif italic text-sm text-faded mb-1">R$ Pendente</p>
              <p className="font-display text-4xl text-canarinho drop-shadow-[0_1px_rgba(0,0,0,0.1)]">{fmt(totalPendente - totalVencido)}</p>
            </div>
            <div className="p-6 animate-count [animation-delay:200ms]">
              <p className="font-serif italic text-sm text-faded mb-1">R$ Vencido</p>
              <p className="font-display text-4xl text-destructive">{fmt(totalVencido)}</p>
            </div>
          </section>

          {/* Súmula de Cobranças */}
          <section>
            <h2 className="font-serif italic text-xl mb-4 border-l-4 border-canarinho pl-3">Súmula de Cobranças</h2>
            <div className="bg-white border border-ink/10">
              <div className="grid grid-cols-12 gap-2 p-4 border-b border-ink/20 bg-ink/5 font-bold text-[10px] uppercase tracking-widest">
                <div className="col-span-5">Jogador / Referência</div>
                <div className="col-span-2 hidden md:block">Vence</div>
                <div className="col-span-2">Valor</div>
                <div className="col-span-3 md:col-span-3 text-right">Status</div>
              </div>
              {charges.length === 0 ? (
                <div className="p-8 text-center font-serif italic text-faded">Nenhuma cobrança ainda. Crie a primeira!</div>
              ) : charges.map((c, i) => {
                const isOverdue = c.status === "pendente" && c.due_date < today;
                const effStatus = isOverdue ? "vencido" : c.status;
                return (
                  <div key={c.id} className="grid grid-cols-12 gap-2 p-4 border-b border-ink/5 items-center hover:bg-paper/50 transition-colors animate-row" style={{ animationDelay: `${i * 30}ms` }}>
                    <div className="col-span-5 flex items-center gap-3">
                      <div className="size-8 rounded-full bg-ink/5 border border-ink/10 flex items-center justify-center font-serif italic text-xs shrink-0">
                        {(pName2id.get(c.participant_id) ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{pName2id.get(c.participant_id) ?? "—"}</p>
                        <p className="text-[10px] text-faded truncate">{c.description}</p>
                      </div>
                    </div>
                    <div className="col-span-2 text-xs font-mono hidden md:block">{fmtDate(c.due_date)}</div>
                    <div className="col-span-2 font-display text-lg">{fmt(Number(c.amount))}</div>
                    <div className="col-span-5 md:col-span-3 text-right flex items-center justify-end gap-2 flex-wrap">
                      <StatusBadge status={effStatus} />
                      {c.status === "pendente" && (
                        <>
                          <button
                            onClick={() => {
                              const part = participants.find((p) => p.id === c.participant_id);
                              const url = buildWaLink(part?.phone ?? null, buildChargeMessage({
                                name: part?.name ?? "",
                                groupName: group.name,
                                amount: Number(c.amount),
                                paymentUrl: `${window.location.origin}/pagar/${c.public_token}`,
                              }));
                              if (!url) return toast.error("Telefone não cadastrado");
                              if (!part?.phone) toast.message("Sem telefone — WhatsApp abrirá sem destinatário");
                              window.open(url, "_blank", "noopener,noreferrer");
                            }}
                            className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 border border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white transition-colors"
                          >
                            Reenviar WA
                          </button>
                          <button onClick={() => markPaid(c.id)} className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 border border-pitch text-pitch hover:bg-pitch hover:text-paper transition-colors">Marcar pago</button>
                        </>
                      )}
                      <Link to="/pagar/$token" params={{ token: c.public_token }} target="_blank" className="text-[10px] font-bold uppercase tracking-widest text-faded hover:text-pitch">Link ↗</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Sidebar: Escalação */}
        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white border-2 border-ink p-6 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 opacity-5 pointer-events-none">
              <div className="size-32 border-[12px] border-ink rounded-full" />
            </div>
            <h3 className="font-display text-2xl mb-6 flex items-center justify-between">
              ESCALAÇÃO
              <span className="font-serif italic text-xs normal-case font-normal text-faded">{participants.length} {participants.length === 1 ? "Jogador" : "Jogadores"}</span>
            </h3>

            {participants.length === 0 ? (
              <p className="font-serif italic text-sm text-faded">Adicione jogadores para começar a cobrar.</p>
            ) : (
              <div className="space-y-4">
                {participants.map((p) => {
                  const st = statusByParticipant.get(p.id);
                  const dot = st === "vencido" ? "bg-destructive" : st === "pendente" ? "bg-canarinho" : "bg-pitch";
                  const label = st === "vencido" ? "Vencido" : st === "pendente" ? "Pendente" : "Em dia";
                  const isEditing = editingId === p.id;
                  if (isEditing) {
                    return (
                      <form key={p.id} onSubmit={saveEdit} className="border-2 border-pitch bg-paper p-3 space-y-2">
                        <input value={eName} onChange={(e) => setEName(e.target.value)} required placeholder="Nome" className="w-full px-2 py-1.5 border border-ink/20 focus:border-pitch outline-none text-sm" />
                        <input value={ePhone} onChange={(e) => setEPhone(e.target.value)} placeholder="Telefone" className="w-full px-2 py-1.5 border border-ink/20 focus:border-pitch outline-none text-sm" />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={ePosition} onChange={(e) => setEPosition(e.target.value)} placeholder="Posição" className="px-2 py-1.5 border border-ink/20 focus:border-pitch outline-none text-sm" />
                          <input value={eJersey} onChange={(e) => setEJersey(e.target.value)} type="number" min="0" placeholder="Camisa" className="px-2 py-1.5 border border-ink/20 focus:border-pitch outline-none text-sm" />
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" disabled={eSaving} className="flex-1 bg-pitch text-paper py-1.5 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50">{eSaving ? "Salvando..." : "Salvar"}</button>
                          <button type="button" onClick={cancelEdit} className="px-3 border border-ink/20 text-[10px] font-bold uppercase tracking-widest">Cancelar</button>
                        </div>
                      </form>
                    );
                  }
                  return (
                    <div key={p.id} className="flex items-center justify-between group gap-2">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <div className="size-10 rounded-sm bg-paper outline outline-ink/10 flex items-center justify-center font-serif italic text-sm">
                            {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                          </div>
                          <div className={`absolute -bottom-1 -right-1 size-3 ${dot} border-2 border-white rounded-full`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate">{p.name}</p>
                          <p className="text-[10px] text-faded uppercase tracking-tighter truncate">{p.position || p.type} · {label}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {p.jersey_number && <div className="font-mono text-xs opacity-40 mr-1">#{p.jersey_number}</div>}
                        <button
                          type="button"
                          aria-label={`Editar ${p.name}`}
                          onClick={() => startEdit(p)}
                          className="p-1.5 border border-ink/10 text-faded hover:text-pitch hover:border-pitch transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button
                          type="button"
                          aria-label={`Excluir ${p.name}`}
                          onClick={() => deletePlayer(p)}
                          className="p-1.5 border border-ink/10 text-faded hover:text-destructive hover:border-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}

              </div>
            )}

            {showAddPlayer ? (
              <form onSubmit={addPlayer} className="mt-6 space-y-2">
                <input value={pName} onChange={(e) => setPName(e.target.value)} required placeholder="Nome" className="w-full px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none text-sm" />
                <input value={pPosition} onChange={(e) => setPPosition(e.target.value)} placeholder="Posição (opcional)" className="w-full px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none text-sm" />
                <input value={pPhone} onChange={(e) => setPPhone(e.target.value)} placeholder="Telefone (opcional)" className="w-full px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none text-sm" />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-pitch text-paper py-2 text-xs font-bold uppercase tracking-widest">Adicionar</button>
                  <button type="button" onClick={() => setShowAddPlayer(false)} className="px-3 border border-ink/20 text-xs font-bold uppercase tracking-widest">×</button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowAddPlayer(true)} className="w-full mt-8 py-2 border border-ink/20 text-xs font-bold uppercase tracking-widest hover:bg-ink hover:text-white transition-colors">
                + Adicionar jogador
              </button>
            )}
          </div>

          <div className="border-2 border-ink bg-white p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-display text-xl uppercase">Configurações Financeiras</h4>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-faded">Mercado Pago</p>
            {ppc?.account ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-pitch" />
                  <span className="text-sm font-bold">Conectado</span>
                  <span className="text-xs text-faded">· {ppc.account.account_label ?? `#${ppc.account.external_user_id}`}</span>
                </div>
                <p className="text-[10px] text-faded">Última sincronização: {new Date(ppc.account.updated_at).toLocaleString("pt-BR")}</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={openMPModal} className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-ink/20 hover:bg-ink hover:text-paper transition-colors">Reconectar</button>
                  <button onClick={disconnectMP} className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest border border-destructive text-destructive hover:bg-destructive hover:text-paper transition-colors">Desvincular</button>
                </div>
              </>
            ) : ppc?.payment_account_id ? (
              <>
                <p className="text-xs text-faded">Conta vinculada existe mas você não é o dono — peça ao organizador para reconectar.</p>
                <button onClick={openMPModal} className="w-full py-2 text-xs font-bold uppercase tracking-widest border-2 border-pitch text-pitch hover:bg-pitch hover:text-paper transition-colors">Conectar minha conta MP</button>
              </>
            ) : (
              <>
                <p className="text-xs text-faded">Conecte sua conta para que cobranças vão direto pra você — a plataforma não toca no dinheiro.</p>
                <button onClick={openMPModal} className="w-full py-2 text-xs font-bold uppercase tracking-widest bg-[#009ee3] text-white hover:opacity-90 transition-opacity">Conectar Mercado Pago</button>
              </>
            )}
            <p className="text-[10px] text-faded pt-2 border-t border-ink/10">Outros gateways (Stripe, Asaas, InfinitePay) chegam em breve com a mesma arquitetura.</p>
          </div>
        </aside>

        {showMPModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={() => !connecting && setShowMPModal(false)}>
            <form onSubmit={submitMP} onClick={(e) => e.stopPropagation()} className="bg-paper border-2 border-ink max-w-md w-full p-6 space-y-4">
              <div>
                <h3 className="font-display text-2xl uppercase">Conectar Mercado Pago</h3>
                <p className="text-xs text-faded mt-1">Cole o <strong>Access Token</strong> da sua aplicação MP. Pegue em <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noreferrer" className="underline">Painel de Desenvolvedores → sua aplicação → Credenciais de produção</a>.</p>
              </div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest">Access Token *</span>
                <input
                  type="password"
                  required
                  autoFocus
                  value={mpToken}
                  onChange={(e) => setMpToken(e.target.value)}
                  placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full border border-ink/30 px-3 py-2 font-mono text-xs bg-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest">Public Key (opcional)</span>
                <input
                  type="text"
                  value={mpPublicKey}
                  onChange={(e) => setMpPublicKey(e.target.value)}
                  placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full border border-ink/30 px-3 py-2 font-mono text-xs bg-white"
                />
              </label>
              <p className="text-[10px] text-faded">Validamos o token chamando <code>/users/me</code> do Mercado Pago antes de salvar. Nada fica gravado se o token for inválido.</p>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowMPModal(false)} disabled={connecting} className="flex-1 py-2 border border-ink/30 text-xs font-bold uppercase tracking-widest disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={connecting || !mpToken} className="flex-1 py-2 bg-[#009ee3] text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50">{connecting ? "Validando..." : "Conectar"}</button>
              </div>
            </form>
          </div>
        )}
      </main>
    </main>
  );
}

function StatusBadge({ status }: { status: "pendente" | "pago" | "vencido" | "cancelado" }) {
  const map = {
    pago: "bg-green-100 text-green-800 border-green-200",
    pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
    vencido: "bg-red-100 text-red-800 border-red-200",
    cancelado: "bg-gray-100 text-gray-700 border-gray-200",
  } as const;
  const labels = { pago: "PAGO", pendente: "PENDENTE", vencido: "VENCIDO", cancelado: "CANCELADO" };
  return <span className={`inline-block px-2 py-0.5 text-[10px] font-bold border ${map[status]}`}>{labels[status]}</span>;
}