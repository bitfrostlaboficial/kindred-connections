// BR Code Pix estático (EMV) — compatível com qualquer app bancário BR.
export function buildPixPayload(args: {
  key: string;
  name: string;
  city: string;
  amount?: number;
  txid?: string;
}) {
  const fmt = (id: string, value: string) =>
    `${id}${value.length.toString().padStart(2, "0")}${value}`;

  const mai = fmt("00", "br.gov.bcb.pix") + fmt("01", args.key);
  const merchantAccountInfo = fmt("26", mai);
  const merchantCategoryCode = fmt("52", "0000");
  const currency = fmt("53", "986");
  const amount = args.amount && args.amount > 0 ? fmt("54", args.amount.toFixed(2)) : "";
  const country = fmt("58", "BR");
  const name = fmt("59", sanitize(args.name).slice(0, 25));
  const city = fmt("60", sanitize(args.city).slice(0, 15));
  const txid = fmt("62", fmt("05", (args.txid || "***").slice(0, 25)));

  const payload =
    fmt("00", "01") +
    merchantAccountInfo +
    merchantCategoryCode +
    currency +
    amount +
    country +
    name +
    city +
    txid +
    "6304";
  return payload + crc16(payload);
}

function sanitize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
