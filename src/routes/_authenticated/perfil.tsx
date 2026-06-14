import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({ meta: [{ title: "Meu perfil — Peladeiro" }] }),
  component: PerfilPage,
});

const POSITIONS = ["Goleiro", "Zagueiro", "Lateral", "Volante", "Meia", "Atacante"];

function PerfilPage() {
  const { user } = Route.useRouteContext();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name,phone,preferred_position")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setFullName(data.full_name ?? "");
        setPhone((data as any).phone ?? "");
        setPosition((data as any).preferred_position ?? "");
      }
      setLoading(false);
    })();
  }, [user.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone, preferred_position: position || null } as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado!");
  };

  if (loading) return <main className="max-w-xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;

  return (
    <main className="max-w-xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <header className="mb-6 border-b-2 border-ink/10 pb-6">
        <h1 className="font-display text-5xl uppercase">Meu Perfil</h1>
        <p className="font-serif italic text-faded mt-1">Suas informações de jogador</p>
      </header>

      <form onSubmit={save} className="bg-white border border-ink/10 rounded-lg p-6 space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-faded">Nome</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1 w-full border-2 border-ink/15 rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-faded">Telefone (WhatsApp)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 91234-5678" className="mt-1 w-full border-2 border-ink/15 rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-faded">Posição preferencial</label>
          <select value={position} onChange={(e) => setPosition(e.target.value)} className="mt-1 w-full border-2 border-ink/15 rounded px-3 py-2 bg-white">
            <option value="">—</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <p className="text-[11px] font-serif italic text-faded mt-1">Apenas sugestão. O organizador define a escalação.</p>
        </div>
        <button type="submit" disabled={saving} className="w-full bg-pitch text-paper px-6 py-3 font-display text-xl uppercase disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </main>
  );
}
