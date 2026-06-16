import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImagePlus, MapPin, Trash2, Calendar, Pencil } from "lucide-react";

type Field = {
  id: string;
  group_id: string;
  name: string;
  address: string | null;
  maps_url: string | null;
  photo_url: string | null;
  notes: string | null;
};

type Game = {
  id: string;
  group_id: string;
  field_id: string | null;
  title: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
  notes: string | null;
  status: string;
};

async function uploadImage(bucket: string, file: File): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Não autenticado");
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export function PeladaSetup({ groupId, coverUrl, onCoverChange }: { groupId: string; coverUrl: string | null; onCoverChange: (url: string | null) => void }) {
  const [fields, setFields] = useState<Field[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [uploadingCover, setUploadingCover] = useState(false);

  // field form
  const [fOpen, setFOpen] = useState(false);
  const [fEditing, setFEditing] = useState<Field | null>(null);
  const [fName, setFName] = useState("");
  const [fAddress, setFAddress] = useState("");
  const [fMaps, setFMaps] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fPhoto, setFPhoto] = useState<string | null>(null);
  const [fSaving, setFSaving] = useState(false);

  // game form
  const [gOpen, setGOpen] = useState(false);
  const [gEditing, setGEditing] = useState<Game | null>(null);
  const [gTitle, setGTitle] = useState("");
  const [gWhen, setGWhen] = useState("");
  const [gDuration, setGDuration] = useState("90");
  const [gFieldId, setGFieldId] = useState<string>("");
  const [gNotes, setGNotes] = useState("");
  const [gSaving, setGSaving] = useState(false);

  const load = async () => {
    const [f, g] = await Promise.all([
      supabase.from("fields").select("*").eq("group_id", groupId).order("name"),
      supabase.from("group_games").select("*").eq("group_id", groupId).gte("scheduled_at", new Date(Date.now() - 86_400_000).toISOString()).order("scheduled_at"),
    ]);
    setFields((f.data ?? []) as Field[]);
    setGames((g.data ?? []) as Game[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [groupId]);

  const onCoverFile = async (file: File | null) => {
    if (!file) return;
    setUploadingCover(true);
    try {
      const url = await uploadImage("group-covers", file);
      const { error } = await supabase.from("groups").update({ cover_image_url: url } as any).eq("id", groupId);
      if (error) throw error;
      onCoverChange(url);
      toast.success("Capa atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar capa");
    } finally { setUploadingCover(false); }
  };
  const removeCover = async () => {
    const { error } = await supabase.from("groups").update({ cover_image_url: null } as any).eq("id", groupId);
    if (error) return toast.error(error.message);
    onCoverChange(null);
  };

  const resetField = () => { setFEditing(null); setFName(""); setFAddress(""); setFMaps(""); setFNotes(""); setFPhoto(null); };
  const editField = (f: Field) => { setFEditing(f); setFName(f.name); setFAddress(f.address ?? ""); setFMaps(f.maps_url ?? ""); setFNotes(f.notes ?? ""); setFPhoto(f.photo_url); setFOpen(true); };
  const saveField = async (e: React.FormEvent) => {
    e.preventDefault();
    setFSaving(true);
    const payload = { group_id: groupId, name: fName.trim(), address: fAddress.trim() || null, maps_url: fMaps.trim() || null, notes: fNotes.trim() || null, photo_url: fPhoto };
    const { error } = fEditing
      ? await supabase.from("fields").update(payload).eq("id", fEditing.id)
      : await supabase.from("fields").insert(payload);
    setFSaving(false);
    if (error) return toast.error(error.message);
    toast.success(fEditing ? "Campo atualizado" : "Campo cadastrado");
    setFOpen(false); resetField(); load();
  };
  const deleteField = async (id: string) => {
    if (!confirm("Excluir este campo?")) return;
    const { error } = await supabase.from("fields").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  const onFieldPhoto = async (file: File | null) => {
    if (!file) return;
    try { const url = await uploadImage("field-photos", file); setFPhoto(url); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha no upload"); }
  };

  const resetGame = () => { setGEditing(null); setGTitle(""); setGWhen(""); setGDuration("90"); setGFieldId(""); setGNotes(""); };
  const editGame = (g: Game) => {
    setGEditing(g); setGTitle(g.title ?? ""); setGWhen(g.scheduled_at.slice(0, 16)); setGDuration(String(g.duration_minutes ?? 90));
    setGFieldId(g.field_id ?? ""); setGNotes(g.notes ?? ""); setGOpen(true);
  };
  const saveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gWhen) return toast.error("Defina data e hora");
    setGSaving(true);
    const payload = {
      group_id: groupId,
      title: gTitle.trim() || null,
      scheduled_at: new Date(gWhen).toISOString(),
      duration_minutes: gDuration ? Number(gDuration) : null,
      field_id: gFieldId || null,
      notes: gNotes.trim() || null,
    };
    const { error } = gEditing
      ? await supabase.from("group_games").update(payload).eq("id", gEditing.id)
      : await supabase.from("group_games").insert(payload);
    setGSaving(false);
    if (error) return toast.error(error.message);
    toast.success(gEditing ? "Jogo atualizado" : "Jogo agendado");
    setGOpen(false); resetGame(); load();
  };
  const deleteGame = async (id: string) => {
    if (!confirm("Excluir este jogo?")) return;
    const { error } = await supabase.from("group_games").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const fmtWhen = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6">
      {/* Capa */}
      <div className="border-2 border-ink bg-white p-6 space-y-3">
        <h4 className="font-display text-xl uppercase">Capa da Pelada</h4>
        <div className="relative aspect-[16/9] bg-paper border border-ink/10 overflow-hidden">
          {coverUrl ? (
            <img src={coverUrl} alt="Capa" className="size-full object-cover" />
          ) : (
            <div className="size-full flex items-center justify-center text-faded font-serif italic text-sm">Sem capa</div>
          )}
        </div>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer text-center py-2 border-2 border-ink text-xs font-bold uppercase tracking-widest hover:bg-ink hover:text-paper transition-colors inline-flex items-center justify-center gap-2">
            <ImagePlus className="size-4" />
            {uploadingCover ? "Enviando..." : coverUrl ? "Trocar capa" : "Enviar capa"}
            <input type="file" accept="image/*" hidden disabled={uploadingCover} onChange={(e) => onCoverFile(e.target.files?.[0] ?? null)} />
          </label>
          {coverUrl && (
            <button type="button" onClick={removeCover} className="px-3 border border-destructive text-destructive text-xs font-bold uppercase tracking-widest hover:bg-destructive hover:text-paper">Remover</button>
          )}
        </div>
      </div>

      {/* Campos */}
      <div className="border-2 border-ink bg-white p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-xl uppercase">Campos</h4>
          <button onClick={() => { resetField(); setFOpen(true); }} className="text-[10px] font-bold uppercase tracking-widest border border-ink px-2 py-1 hover:bg-ink hover:text-paper">+ Novo</button>
        </div>
        {fields.length === 0 ? (
          <p className="text-[11px] font-serif italic text-faded">Cadastre os locais onde a pelada acontece.</p>
        ) : (
          <ul className="space-y-2">
            {fields.map((f) => (
              <li key={f.id} className="border border-ink/15 p-2 flex gap-3 items-start">
                {f.photo_url ? <img src={f.photo_url} alt={f.name} className="size-14 object-cover border border-ink/10 shrink-0" /> : <div className="size-14 bg-paper border border-ink/10 flex items-center justify-center shrink-0"><MapPin className="size-5 text-faded" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">{f.name}</p>
                  {f.address && <p className="text-[11px] text-faded truncate">{f.address}</p>}
                  {f.maps_url && <a href={f.maps_url} target="_blank" rel="noreferrer" className="text-[10px] underline text-pitch">Ver no mapa</a>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => editField(f)} className="p-1 text-faded hover:text-pitch"><Pencil className="size-3.5" /></button>
                  <button onClick={() => deleteField(f.id)} className="p-1 text-faded hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Próximos jogos */}
      <div className="border-2 border-ink bg-white p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-display text-xl uppercase">Próximos Jogos</h4>
          <button onClick={() => { resetGame(); setGOpen(true); }} className="text-[10px] font-bold uppercase tracking-widest border border-ink px-2 py-1 hover:bg-ink hover:text-paper">+ Agendar</button>
        </div>
        {games.length === 0 ? (
          <p className="text-[11px] font-serif italic text-faded">Nenhum jogo agendado.</p>
        ) : (
          <ul className="space-y-2">
            {games.map((g) => {
              const field = fields.find((x) => x.id === g.field_id);
              return (
                <li key={g.id} className="border border-ink/15 p-2 flex gap-3 items-start">
                  <div className="size-10 bg-pitch text-paper flex flex-col items-center justify-center shrink-0">
                    <Calendar className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase">{fmtWhen(g.scheduled_at)}</p>
                    {g.title && <p className="text-sm truncate">{g.title}</p>}
                    {field && <p className="text-[11px] text-faded truncate">📍 {field.name}</p>}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => editGame(g)} className="p-1 text-faded hover:text-pitch"><Pencil className="size-3.5" /></button>
                    <button onClick={() => deleteGame(g.id)} className="p-1 text-faded hover:text-destructive"><Trash2 className="size-3.5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal Field */}
      {fOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={() => setFOpen(false)}>
          <form onSubmit={saveField} onClick={(e) => e.stopPropagation()} className="bg-paper border-2 border-ink max-w-md w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-2xl uppercase">{fEditing ? "Editar campo" : "Novo campo"}</h3>
            <input required value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Nome (ex: Quadra do Zé)" className="w-full border border-ink/30 px-3 py-2 text-sm" />
            <input value={fAddress} onChange={(e) => setFAddress(e.target.value)} placeholder="Endereço" className="w-full border border-ink/30 px-3 py-2 text-sm" />
            <input value={fMaps} onChange={(e) => setFMaps(e.target.value)} placeholder="Link Google Maps" className="w-full border border-ink/30 px-3 py-2 text-sm" />
            <textarea value={fNotes} onChange={(e) => setFNotes(e.target.value)} placeholder="Observações" className="w-full border border-ink/30 px-3 py-2 text-sm" rows={2} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1">Foto do campo</p>
              {fPhoto && <img src={fPhoto} alt="" className="w-full aspect-video object-cover border border-ink/10 mb-2" />}
              <label className="block cursor-pointer text-center py-2 border border-ink text-[10px] font-bold uppercase tracking-widest hover:bg-ink hover:text-paper">
                {fPhoto ? "Trocar foto" : "Enviar foto"}
                <input type="file" accept="image/*" hidden onChange={(e) => onFieldPhoto(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setFOpen(false)} className="flex-1 py-2 border border-ink/30 text-xs font-bold uppercase tracking-widest">Cancelar</button>
              <button type="submit" disabled={fSaving || !fName.trim()} className="flex-1 py-2 bg-pitch text-paper text-xs font-bold uppercase tracking-widest disabled:opacity-50">{fSaving ? "Salvando..." : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Game */}
      {gOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4" onClick={() => setGOpen(false)}>
          <form onSubmit={saveGame} onClick={(e) => e.stopPropagation()} className="bg-paper border-2 border-ink max-w-md w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display text-2xl uppercase">{gEditing ? "Editar jogo" : "Agendar jogo"}</h3>
            <input value={gTitle} onChange={(e) => setGTitle(e.target.value)} placeholder="Título (opcional, ex: Pelada de quinta)" className="w-full border border-ink/30 px-3 py-2 text-sm" />
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest">Data e hora *</span>
              <input required type="datetime-local" value={gWhen} onChange={(e) => setGWhen(e.target.value)} className="w-full border border-ink/30 px-3 py-2 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest">Duração (min)</span>
              <input type="number" min={15} step={15} value={gDuration} onChange={(e) => setGDuration(e.target.value)} className="w-full border border-ink/30 px-3 py-2 text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest">Campo</span>
              <select value={gFieldId} onChange={(e) => setGFieldId(e.target.value)} className="w-full border border-ink/30 px-3 py-2 text-sm bg-white">
                <option value="">— Sem campo definido —</option>
                {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <textarea value={gNotes} onChange={(e) => setGNotes(e.target.value)} placeholder="Observações" rows={2} className="w-full border border-ink/30 px-3 py-2 text-sm" />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setGOpen(false)} className="flex-1 py-2 border border-ink/30 text-xs font-bold uppercase tracking-widest">Cancelar</button>
              <button type="submit" disabled={gSaving} className="flex-1 py-2 bg-pitch text-paper text-xs font-bold uppercase tracking-widest disabled:opacity-50">{gSaving ? "Salvando..." : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
