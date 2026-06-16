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
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const googleAvatar =
    (user.user_metadata as any)?.avatar_url || (user.user_metadata as any)?.picture || null;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name,phone,preferred_position,nickname,avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setFullName(data.full_name ?? "");
        setPhone((data as any).phone ?? "");
        setPosition((data as any).preferred_position ?? "");
        setNickname((data as any).nickname ?? "");
        setAvatarUrl((data as any).avatar_url ?? null);
      }
      setLoading(false);
    })();
  }, [user.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        preferred_position: position || null,
        nickname: nickname.trim() || null,
      } as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado!");
  };

  const setAvatar = async (url: string | null) => {
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url } as any)
      .eq("id", user.id);
    if (error) return toast.error(error.message);
    setAvatarUrl(url);
    toast.success(url ? "Foto atualizada!" : "Foto removida.");
  };

  if (loading)
    return <main className="max-w-xl mx-auto px-6 py-12 font-serif italic text-faded">Carregando...</main>;

  const display = nickname.trim() || fullName || "Jogador";
  const initial = display.charAt(0).toUpperCase();

  return (
    <main className="max-w-xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <header className="mb-6 border-b-2 border-ink/10 pb-6">
        <h1 className="font-display text-5xl uppercase">Meu Perfil</h1>
        <p className="font-serif italic text-faded mt-1">Suas informações de jogador</p>
      </header>

      <section className="bg-white border border-ink/10 rounded-lg p-6 mb-4 flex items-center gap-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt={display} className="size-20 rounded-full object-cover border-2 border-ink/15" />
        ) : (
          <div className="size-20 rounded-full bg-pitch text-paper flex items-center justify-center font-display text-3xl">
            {initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-display text-2xl uppercase truncate">{display}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {googleAvatar && googleAvatar !== avatarUrl && (
              <button
                onClick={() => setAvatar(googleAvatar)}
                className="text-[10px] font-bold uppercase tracking-widest border-2 border-ink px-2 py-1 hover:bg-ink hover:text-paper"
              >
                Usar foto do Google
              </button>
            )}
            {avatarUrl && (
              <button
                onClick={() => setAvatar(null)}
                className="text-[10px] font-bold uppercase tracking-widest border-2 border-ink/30 px-2 py-1 hover:border-destructive hover:text-destructive"
              >
                Remover foto
              </button>
            )}
          </div>
        </div>
      </section>

      <form onSubmit={save} className="bg-white border border-ink/10 rounded-lg p-6 space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-faded">Nome completo</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1 w-full border-2 border-ink/15 rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-faded">Apelido (opcional)</label>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Como te chamam na pelada" className="mt-1 w-full border-2 border-ink/15 rounded px-3 py-2" />
          <p className="text-[11px] font-serif italic text-faded mt-1">Se preenchido, será exibido no lugar do nome.</p>
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
