export function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}
export function normalizeBRPhone(phone: string | null | undefined): string | null {
  const d = onlyDigits(phone);
  if (!d) return null;
  if (d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}
export function buildWaLink(phone: string | null | undefined, message: string): string | null {
  const n = normalizeBRPhone(phone);
  const text = encodeURIComponent(message);
  return n ? `https://wa.me/${n}?text=${text}` : `https://wa.me/?text=${text}`;
}
export function buildChargeMessage(opts: {
  name: string;
  groupName: string;
  amount: number;
  paymentUrl: string;
}) {
  const v = opts.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `Oi ${opts.name}, sua cota da pelada ${opts.groupName} é ${v}. Pague aqui: ${opts.paymentUrl}`;
}
