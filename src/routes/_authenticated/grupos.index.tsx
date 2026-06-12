import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/grupos/")({
  head: () => ({ meta: [{ title: "Minhas Peladas — Peladeiro" }] }),
  component: GroupsPage,
});

type Group = { id: string; name: string; description: string | null; created_at: string };

function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("groups").select("id,name,description,created_at").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setGroups(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      toast.error("Sessão expirada. Entre novamente.");
      setCreating(false);
      navigate({ to: "/auth" });
      return;
    }
    const payload = {
      name,
      description: description || null,
      pix_key: pixKey || null,
      pix_recipient_name: recipientName || null,
      default_monthly_fee: monthlyFee ? Number(monthlyFee) : null,
      created_by: user.id,
    };
    console.log("[grupos] insert", { uid: user.id, payload });
    const { data, error } = await supabase.from("groups").insert(payload).select().single();
    if (error) {
      console.error("[grupos] insert error", error);
      toast.error(`${error.message}${error.code ? ` (${error.code})` : ""}`);
      setCreating(false);
      return;
    }
    if (pixKey && recipientName) {
      await supabase.from("payment_provider_configs").insert({
        group_id: data.id,
        provider: "pix_manual",
        config: { pix_key: pixKey, recipient_name: recipientName },
      });
    }
    toast.success("Pelada criada!");
    navigate({ to: "/grupos/$groupId", params: { groupId: data.id } });
  };

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <div className="flex items-end justify-between mb-8 border-b-2 border-ink/10 pb-6 gap-4 flex-wrap">
        <div>
          <span className="font-serif italic text-sm text-faded">Suas peladas</span>
          <h1 className="font-display text-5xl uppercase leading-none mt-1">Minhas peladas</h1>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-pitch text-paper px-6 py-3 font-display text-xl tracking-wide flex items-center gap-3 hover:bg-ink transition-colors shadow-ledger active:translate-y-0.5 active:shadow-none"
        >
          NOVA PELADA <span className="text-canarinho">+</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="bg-white border-2 border-ink shadow-ledger-soft p-6 mb-8 space-y-4 animate-row">
          <h2 className="font-display text-2xl uppercase">Nova pelada</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest">Nome *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Pelada do Aterro" className="w-full mt-1 px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest">Mensalidade padrão</label>
              <input value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} type="number" step="0.01" placeholder="60,00" className="w-full mt-1 px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest">Descrição</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sábado 9h, Arena Maracanã" className="w-full mt-1 px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest">Chave Pix (recebimento)</label>
              <input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="seuemail@pix.com.br" className="w-full mt-1 px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest">Nome do recebedor</label>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Tiago Silva" className="w-full mt-1 px-3 py-2 border-2 border-ink/20 focus:border-pitch outline-none" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={creating} className="bg-pitch text-paper px-6 py-2 font-bold uppercase text-sm tracking-widest shadow-ledger disabled:opacity-50">
              {creating ? "Salvando..." : "Criar pelada"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 border-2 border-ink/20 font-bold uppercase text-sm tracking-widest hover:bg-ink/5">Cancelar</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="font-serif italic text-faded">Carregando...</p>
      ) : groups.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-ink/30 p-12 text-center">
          <h3 className="font-display text-3xl uppercase">Nenhuma pelada ainda</h3>
          <p className="font-serif italic text-faded mt-2">Crie sua primeira pelada e comece a cobrar a galera.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((g) => (
            <Link
              key={g.id}
              to="/grupos/$groupId"
              params={{ groupId: g.id }}
              className="bg-white border-2 border-ink p-6 hover:shadow-ledger transition-shadow block group"
            >
              <div className="text-[10px] font-bold uppercase tracking-widest text-faded">Pelada</div>
              <h3 className="font-display text-3xl uppercase leading-none mt-1 group-hover:text-pitch transition-colors">{g.name}</h3>
              {g.description && <p className="font-serif italic text-sm text-faded mt-3">{g.description}</p>}
              <div className="mt-6 text-xs font-bold uppercase tracking-widest text-pitch">Abrir súmula →</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}