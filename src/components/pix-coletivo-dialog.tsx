import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Copy, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { buildPixPayload } from "@/lib/payments/pix-payload";

type Props = {
  open: boolean;
  onClose: () => void;
  groupName: string;
  pixKey: string | null;
  pixRecipientName: string | null;
};

export function PixColetivoDialog({ open, onClose, groupName, pixKey, pixRecipientName }: Props) {
  const [amountStr, setAmountStr] = useState("");
  const [label, setLabel] = useState(`Pelada ${groupName}`);
  const [qrUrl, setQrUrl] = useState<string>("");

  const amount = useMemo(() => {
    const n = Number(amountStr.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [amountStr]);

  const payload = useMemo(() => {
    if (!pixKey || !pixRecipientName) return "";
    return buildPixPayload({
      key: pixKey,
      name: pixRecipientName,
      city: "BRASIL",
      amount,
      txid: "PELADA",
    });
  }, [pixKey, pixRecipientName, amount]);

  useEffect(() => {
    if (!payload) return setQrUrl("");
    QRCode.toDataURL(payload, { margin: 1, width: 280 }).then(setQrUrl).catch(() => setQrUrl(""));
  }, [payload]);

  if (!open) return null;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copiado"); }
    catch { toast.error("Falha ao copiar"); }
  };

  const waText = `*${label}*${amount ? `\nValor: ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}\n\nPix copia e cola:\n${payload}`;
  const waUrl = payload ? `https://wa.me/?text=${encodeURIComponent(waText)}` : "";

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-paper border-2 border-ink rounded-lg max-w-md w-full p-6 shadow-ledger" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl uppercase">Pix Coletivo</h2>
            <p className="font-serif italic text-sm text-faded">{groupName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-faded hover:text-ink"><X className="size-5" /></button>
        </div>

        {!pixKey || !pixRecipientName ? (
          <p className="text-sm text-destructive font-serif italic">
            Configure a chave Pix e o nome do recebedor nas configurações financeiras do grupo.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="text-xs">
                <span className="font-bold uppercase tracking-widest text-faded">Descrição</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full bg-white border border-ink/20 rounded px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs">
                <span className="font-bold uppercase tracking-widest text-faded">Valor (opcional)</span>
                <input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0,00" inputMode="decimal" className="mt-1 w-full bg-white border border-ink/20 rounded px-2 py-1.5 text-sm tabular-nums" />
              </label>
            </div>

            {qrUrl && (
              <div className="flex justify-center mb-4">
                <img src={qrUrl} alt="QR Code Pix" className="border border-ink/15 rounded" />
              </div>
            )}

            <div className="bg-white border border-ink/15 rounded p-2 mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-faded mb-1">Copia e cola</p>
              <p className="text-[11px] font-mono break-all leading-snug">{payload}</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => copy(payload)} className="flex-1 inline-flex items-center justify-center gap-2 border-2 border-ink px-3 py-2 font-display text-sm hover:bg-ink hover:text-paper transition-colors">
                <Copy className="size-4" /> Copiar
              </button>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-2 bg-pitch text-paper px-3 py-2 font-display text-sm hover:bg-ink transition-colors">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
