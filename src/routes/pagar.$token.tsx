import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/pagar/$token")({
  head: () => ({ meta: [{ title: "Pagar cobrança — Peladeiro" }, { name: "robots", content: "noindex" }] }),
  component: PayPage,
});

type ChargeView = {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: "pendente" | "pago" | "vencido" | "cancelado";
  pix_copy_paste: string | null;
  pix_qr_code: string | null;
  payment_link: string | null;
  paid_at: string | null;
  groups: { name: string; pix_recipient_name: string | null } | null;
  participants: { name: string } | null;
};

function PayPage() {
  const { token } = Route.useParams();
  const [charge, setCharge] = useState<ChargeView | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase
      .from("charges")
      .select("id,description,amount,due_date,status,pix_copy_paste,pix_qr_code,payment_link,paid_at,groups(name,pix_recipient_name),participants(name)")
      .eq("public_token", token)
      .maybeSingle()
      .then(({ data }) => {
        setCharge(data as ChargeView | null);
        setLoading(false);
      });
  }, [token]);

  const copy = async () => {
    if (!charge?.pix_copy_paste) return;
    await navigator.clipboard.writeText(charge.pix_copy_paste);
    setCopied(true);
    toast.success("Pix copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <main className="min-h-screen flex items-center justify-center font-serif italic text-faded">Carregando cobrança...</main>;
  if (!charge) return <main className="min-h-screen flex items-center justify-center"><div className="text-center"><h1 className="font-display text-5xl">Cobrança não encontrada</h1><p className="font-serif italic text-faded mt-2">Confira o link com o organizador.</p></div></main>;

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = charge.status === "pendente" && charge.due_date < today;
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="min-h-screen bg-paper text-ink p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-9 bg-pitch rounded-sm rotate-3 flex items-center justify-center text-canarinho font-display text-2xl shadow-sm">P</div>
          <span className="font-display text-2xl tracking-tight">PELADEIRO</span>
        </div>

        <div className="bg-white border-2 border-ink shadow-ledger-soft p-6 md:p-8">
          <div className="text-[10px] font-bold uppercase tracking-widest text-faded">{charge.groups?.name ?? "Pelada"}</div>
          <h1 className="font-display text-3xl uppercase leading-tight mt-1">{charge.description}</h1>
          <p className="font-serif italic text-sm text-faded mt-1">Jogador: {charge.participants?.name ?? "—"}</p>

          <div className="my-6 py-6 border-y-2 border-ink/10 text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-faded">Valor a pagar</div>
            <div className="font-display text-6xl text-pitch mt-1">{fmt(Number(charge.amount))}</div>
            <div className="font-serif italic text-xs text-faded mt-2">Vence em {new Date(charge.due_date + "T12:00:00").toLocaleDateString("pt-BR")}</div>
          </div>

          {charge.status === "pago" ? (
            <div className="bg-green-100 border-2 border-green-300 p-4 text-center">
              <div className="font-display text-2xl text-green-800">PAGAMENTO CONFIRMADO ✓</div>
              {charge.paid_at && <div className="font-serif italic text-xs text-green-700 mt-1">em {new Date(charge.paid_at).toLocaleDateString("pt-BR")}</div>}
            </div>
          ) : charge.status === "cancelado" ? (
            <div className="bg-gray-100 border-2 border-gray-300 p-4 text-center font-display text-xl">Cobrança cancelada</div>
          ) : (
            <>
              {isOverdue && <div className="bg-red-100 border-2 border-red-300 p-3 text-center font-bold text-sm uppercase tracking-widest text-red-800 mb-4">Cobrança vencida</div>}

              {charge.pix_copy_paste ? (
                <>
                  {charge.pix_qr_code && (
                    <div className="flex justify-center mb-4">
                      <img src={`data:image/png;base64,${charge.pix_qr_code}`} alt="QR Code Pix" className="size-56 border-2 border-ink/10" />
                    </div>
                  )}
                  <div className="text-[10px] font-bold uppercase tracking-widest text-faded mb-2">Pix Copia e Cola</div>
                  <div className="border-2 border-ink/10 p-3 bg-paper text-xs font-mono break-all max-h-32 overflow-y-auto">
                    {charge.pix_copy_paste}
                  </div>
                  <button onClick={copy} className="w-full mt-4 bg-pitch text-paper py-3 font-display text-xl tracking-wide hover:bg-ink transition-colors shadow-ledger active:translate-y-0.5 active:shadow-none">
                    {copied ? "COPIADO ✓" : "COPIAR PIX"}
                  </button>
                  {charge.groups?.pix_recipient_name && <p className="font-serif italic text-xs text-faded text-center mt-3">Recebedor: {charge.groups.pix_recipient_name}</p>}
                </>
              ) : charge.payment_link ? (
                <a href={charge.payment_link} className="block text-center bg-pitch text-paper py-3 font-display text-xl tracking-wide hover:bg-ink transition-colors shadow-ledger">PAGAR AGORA</a>
              ) : (
                <p className="font-serif italic text-faded text-center text-sm">Aguardando configuração de pagamento pelo organizador.</p>
              )}
            </>
          )}
        </div>

        <p className="text-center font-serif italic text-xs text-faded mt-6">
          Peladeiro — gestão financeira da sua pelada
        </p>
      </div>
    </div>
  );
}