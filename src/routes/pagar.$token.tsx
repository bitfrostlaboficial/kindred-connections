import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCheckoutInfo, payWithCard, createStripePaymentIntent } from "@/lib/payments/checkout.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/pagar/$token")({
  head: () => ({ meta: [{ title: "Pagar cobrança — Peladeiro" }, { name: "robots", content: "noindex" }] }),
  component: PayPage,
});

type Method = "pix" | "card";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PayPage() {
  const { token } = Route.useParams();
  const getInfo = useServerFn(getCheckoutInfo);

  const q = useQuery({
    queryKey: ["checkout", token],
    queryFn: () => getInfo({ data: { token } }),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d && d.charge.status === "pendente" ? 5000 : false;
    },
  });

  const [tab, setTab] = useState<Method>("pix");

  useEffect(() => {
    if (q.data && !q.data.methods.includes(tab)) setTab(q.data.methods[0] ?? "pix");
  }, [q.data, tab]);

  if (q.isLoading) {
    return <main className="min-h-screen flex items-center justify-center font-serif italic text-faded">Carregando cobrança...</main>;
  }
  if (q.error || !q.data) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="font-display text-5xl">Cobrança não encontrada</h1>
          <p className="font-serif italic text-faded mt-2">Confira o link com o organizador.</p>
        </div>
      </main>
    );
  }

  const { charge, methods, publicKey, provider } = q.data;
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = charge.status === "pendente" && charge.due_date < today;

  return (
    <div className="min-h-screen bg-paper text-ink p-4 md:p-8">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-9 bg-pitch rounded-sm rotate-3 flex items-center justify-center text-canarinho font-display text-2xl shadow-sm">P</div>
          <span className="font-display text-2xl tracking-tight">PELADEIRO</span>
        </div>

        <div className="bg-white border-2 border-ink shadow-ledger-soft p-6 md:p-8">
          <div className="text-[10px] font-bold uppercase tracking-widest text-faded">Cobrança</div>
          <h1 className="font-display text-3xl uppercase leading-tight mt-1">{charge.description}</h1>

          <div className="my-6 py-6 border-y-2 border-ink/10 text-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-faded">Valor a pagar</div>
            <div className="font-display text-6xl text-pitch mt-1">{fmtBRL(charge.amount)}</div>
            <div className="font-serif italic text-xs text-faded mt-2">
              Vence em {new Date(charge.due_date + "T12:00:00").toLocaleDateString("pt-BR")}
            </div>
          </div>

          {charge.status === "pago" ? (
            <SuccessPanel paidAt={charge.paid_at} />
          ) : charge.status === "cancelado" ? (
            <div className="bg-gray-100 border-2 border-gray-300 p-4 text-center font-display text-xl">Cobrança cancelada</div>
          ) : (
            <>
              {isOverdue && (
                <div className="bg-red-100 border-2 border-red-300 p-3 text-center font-bold text-sm uppercase tracking-widest text-red-800 mb-4">
                  Cobrança vencida
                </div>
              )}

              {methods.length > 1 && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {methods.map((m) => (
                    <button
                      key={m}
                      onClick={() => setTab(m)}
                      className={`py-2 font-display text-lg tracking-wide border-2 transition-colors ${
                        tab === m ? "bg-pitch text-paper border-pitch" : "bg-paper border-ink/20 text-ink hover:border-ink"
                      }`}
                    >
                      {m === "pix" ? "PIX" : "CARTÃO"}
                    </button>
                  ))}
                </div>
              )}

              {tab === "pix" ? (
                <PixPanel charge={charge} onRefresh={() => q.refetch()} />
              ) : (
                <CardPanel
                  token={token}
                  amount={charge.amount}
                  publicKey={publicKey}
                  provider={provider}
                  onPaid={() => q.refetch()}
                />
              )}
            </>
          )}
        </div>

        <p className="text-center font-serif italic text-xs text-faded mt-6">Peladeiro — gestão financeira da sua pelada</p>
      </div>
    </div>
  );
}

function SuccessPanel({ paidAt }: { paidAt: string | null }) {
  return (
    <div className="bg-green-100 border-2 border-green-300 p-4 text-center">
      <div className="font-display text-2xl text-green-800">PAGAMENTO CONFIRMADO ✓</div>
      {paidAt && <div className="font-serif italic text-xs text-green-700 mt-1">em {new Date(paidAt).toLocaleDateString("pt-BR")}</div>}
    </div>
  );
}

function PixPanel({ charge, onRefresh }: { charge: any; onRefresh: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!charge.pix_copy_paste) {
    return <p className="font-serif italic text-faded text-center text-sm">Pix sendo gerado... atualize em instantes.</p>;
  }
  const copy = async () => {
    await navigator.clipboard.writeText(charge.pix_copy_paste);
    setCopied(true);
    toast.success("Pix copiado!");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
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
      <button
        onClick={copy}
        className="w-full mt-4 bg-pitch text-paper py-3 font-display text-xl tracking-wide hover:bg-ink transition-colors shadow-ledger active:translate-y-0.5 active:shadow-none"
      >
        {copied ? "COPIADO ✓" : "COPIAR PIX"}
      </button>
      <button
        onClick={onRefresh}
        className="w-full mt-2 bg-paper border-2 border-ink/20 text-ink py-2 font-display text-sm tracking-wide hover:border-ink transition-colors"
      >
        ATUALIZAR STATUS
      </button>
    </>
  );
}

// ---- Card (Mercado Pago SDK v2) ----

declare global {
  interface Window { MercadoPago?: any }
}

function CardPanel({
  token,
  amount,
  publicKey,
  provider,
  onPaid,
}: {
  token: string;
  amount: number;
  publicKey: string | null;
  provider: string;
  onPaid: () => void;
}) {
  const pay = useServerFn(payWithCard);
  const [sdkReady, setSdkReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mpRef = useRef<any>(null);

  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [doc, setDoc] = useState("");
  const [email, setEmail] = useState("");
  const [installments, setInstallments] = useState(1);

  const canTryStripe = provider === "stripe";

  useEffect(() => {
    if (provider !== "mercado_pago" || !publicKey) return;
    if (window.MercadoPago) {
      mpRef.current = new window.MercadoPago(publicKey);
      setSdkReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.async = true;
    s.onload = () => {
      if (window.MercadoPago) {
        mpRef.current = new window.MercadoPago(publicKey);
        setSdkReady(true);
      }
    };
    s.onerror = () => setError("Não foi possível carregar o SDK do Mercado Pago");
    document.head.appendChild(s);
  }, [provider, publicKey]);

  const installmentOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  if (!publicKey) {
    return (
      <div className="border-2 border-yellow-300 bg-yellow-50 p-4 text-sm">
        <p className="font-bold uppercase tracking-widest text-xs text-yellow-800 mb-1">Cartão indisponível</p>
        <p className="font-serif text-yellow-900">
          O organizador ainda não cadastrou a Public Key do gateway. Use Pix por enquanto.
        </p>
      </div>
    );
  }

  if (canTryStripe) {
    return (
      <div className="border-2 border-ink/10 p-4 text-sm font-serif italic text-faded text-center">
        Pagamento com cartão via Stripe será habilitado em breve. Use Pix por enquanto.
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!mpRef.current) { setError("SDK ainda carregando"); return; }
    const [mm, yy] = exp.split("/").map((s) => s.trim());
    if (!mm || !yy) { setError("Validade no formato MM/AA"); return; }
    if (!/^\d{11}$|^\d{14}$/.test(doc.replace(/\D/g, ""))) { setError("CPF/CNPJ inválido"); return; }
    setSubmitting(true);
    try {
      const tokenRes = await mpRef.current.createCardToken({
        cardNumber: number.replace(/\s+/g, ""),
        cardholderName: name,
        cardExpirationMonth: mm,
        cardExpirationYear: yy.length === 2 ? `20${yy}` : yy,
        securityCode: cvv,
        identificationType: doc.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ",
        identificationNumber: doc.replace(/\D/g, ""),
      });
      if (!tokenRes?.id) throw new Error("Falha ao tokenizar cartão");

      // Descobre payment_method_id (visa/master/etc) pelo BIN
      let paymentMethodId = "visa";
      try {
        const bin = number.replace(/\s+/g, "").slice(0, 8);
        const pm = await mpRef.current.getPaymentMethods({ bin });
        paymentMethodId = pm?.results?.[0]?.id ?? paymentMethodId;
      } catch { /* ignore — fallback visa */ }

      const result = await pay({
        data: {
          token,
          cardToken: tokenRes.id,
          paymentMethodId,
          installments,
          payerEmail: email,
          payerDocType: doc.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ",
          payerDocNumber: doc,
        },
      });

      if (result.status === "pago") {
        toast.success("Pagamento aprovado!");
        onPaid();
      } else if (result.status === "pendente") {
        toast.message("Pagamento em análise. Acompanhe o status nesta tela.");
        onPaid();
      } else {
        setError(result.statusDetail ? `Recusado: ${result.statusDetail}` : "Pagamento recusado");
      }
    } catch (err: any) {
      const msg = err?.message ?? (Array.isArray(err) ? err.map((e: any) => e.message).join(", ") : "Erro ao processar cartão");
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const Field = (props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => {
    const { label, ...rest } = props;
    return (
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-widest text-faded">{label}</span>
        <input
          {...rest}
          className="w-full mt-1 border-2 border-ink/20 focus:border-ink outline-none p-2 font-mono text-sm bg-paper"
        />
      </label>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!sdkReady && <p className="font-serif italic text-xs text-faded">Carregando módulo seguro de cartão...</p>}
      <Field label="Número do cartão" inputMode="numeric" autoComplete="cc-number" value={number} onChange={(e) => setNumber(e.target.value)} required />
      <Field label="Nome do titular" autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} required />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Validade MM/AA" placeholder="12/28" autoComplete="cc-exp" value={exp} onChange={(e) => setExp(e.target.value)} required />
        <Field label="CVV" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cvv} onChange={(e) => setCvv(e.target.value)} required />
      </div>
      <Field label="CPF do titular" inputMode="numeric" value={doc} onChange={(e) => setDoc(e.target.value)} required />
      <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-widest text-faded">Parcelamento</span>
        <select
          value={installments}
          onChange={(e) => setInstallments(Number(e.target.value))}
          className="w-full mt-1 border-2 border-ink/20 focus:border-ink outline-none p-2 font-mono text-sm bg-paper"
        >
          {installmentOptions.map((n) => (
            <option key={n} value={n}>
              {n}x de {fmtBRL(amount / n)} {n === 1 ? "(à vista)" : ""}
            </option>
          ))}
        </select>
      </label>

      {error && <div className="border-2 border-red-300 bg-red-50 p-2 text-sm text-red-800 font-mono">{error}</div>}

      <button
        type="submit"
        disabled={submitting || !sdkReady}
        className="w-full bg-pitch text-paper py-3 font-display text-xl tracking-wide hover:bg-ink transition-colors shadow-ledger active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "PROCESSANDO..." : `PAGAR ${fmtBRL(amount)}`}
      </button>
      <p className="text-[10px] font-serif italic text-faded text-center">
        Dados do cartão são enviados diretamente ao gateway. A plataforma nunca recebe número ou CVV.
      </p>
    </form>
  );
}
