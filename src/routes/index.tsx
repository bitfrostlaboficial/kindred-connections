import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Peladeiro — Gestão financeira da sua pelada" },
      { name: "description", content: "Cobre mensalidade, controle pagamentos e acabe com a inadimplência. Pix, link e súmula financeira para grupos de futebol amador." },
      { property: "og:title", content: "Peladeiro — Gestão financeira da pelada" },
      { property: "og:description", content: "Cobre mensalidade, controle pagamentos e acabe com a inadimplência da sua pelada." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 bg-pitch rounded-sm rotate-3 flex items-center justify-center text-canarinho font-display text-2xl shadow-sm">P</div>
          <span className="font-display text-2xl tracking-tight">PELADEIRO</span>
        </div>
        <Link to="/auth" className="font-bold text-sm uppercase tracking-wider hover:text-pitch">Entrar</Link>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-12 gap-10 items-center">
        <div className="md:col-span-7 space-y-6">
          <span className="inline-block px-3 py-1 border-2 border-ink text-[10px] font-bold uppercase tracking-widest">Pelada · Society · Futsal</span>
          <h1 className="font-display text-6xl md:text-8xl leading-[0.9] uppercase tracking-tight">
            Acabou a<br/>
            <span className="text-pitch">cobrança no grupo</span><br/>
            do zap.
          </h1>
          <p className="font-serif italic text-lg max-w-[55ch] text-faded">
            O Peladeiro é o caderno do tesoureiro digital da sua pelada. Cobra mensalidade, gera Pix, controla quem pagou e quem ficou devendo. Sem planilha, sem dor de cabeça.
          </p>
          <div className="flex flex-wrap gap-3 pt-4">
            <Link to="/auth" className="bg-pitch text-paper px-7 py-3 font-display text-xl tracking-wide flex items-center gap-3 hover:bg-ink transition-colors shadow-ledger active:translate-y-0.5 active:shadow-none">
              COMEÇAR DE GRAÇA <span className="text-canarinho">→</span>
            </Link>
            <a href="#como-funciona" className="px-6 py-3 border-2 border-ink text-sm font-bold uppercase tracking-widest hover:bg-ink hover:text-paper transition-colors">Como funciona</a>
          </div>
        </div>

        <div className="md:col-span-5">
          <div className="bg-white border-2 border-ink shadow-ledger-soft p-6 rotate-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-faded mb-2">Súmula · Agosto/24</div>
            <div className="font-display text-3xl text-pitch mb-1">R$ 1.850,00</div>
            <div className="font-serif italic text-xs text-faded mb-6">arrecadado este mês</div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-ink/10 pb-2"><span>João Delgado</span><span className="font-bold text-pitch">PAGO</span></div>
              <div className="flex justify-between border-b border-ink/10 pb-2"><span>Ricardo Pereira</span><span className="font-bold text-canarinho">PENDENTE</span></div>
              <div className="flex justify-between"><span>Marcos Teixeira</span><span className="font-bold text-destructive">VENCIDO</span></div>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-ink text-paper py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-display text-5xl md:text-6xl uppercase mb-12 text-canarinho">Como funciona</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "01", t: "Cadastre a galera", d: "Adicione os mensalistas e avulsos do seu grupo. Posição, número da camisa, tudo." },
              { n: "02", t: "Gere a cobrança", d: "Pix manual ou um gateway integrado. O sistema cria o QR Code e o link de pagamento." },
              { n: "03", t: "Veja quem pagou", d: "Súmula financeira em tempo real. Pendentes, vencidos, pagos. Cobrança no whats, nunca mais." },
            ].map((s) => (
              <div key={s.n} className="border-l-4 border-canarinho pl-5">
                <div className="font-display text-5xl text-canarinho">{s.n}</div>
                <h3 className="font-display text-2xl mt-2 mb-2 uppercase">{s.t}</h3>
                <p className="font-serif italic text-paper/70">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t-2 border-ink/10 py-8 mt-0">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-serif italic text-sm text-faded">Feito com bola no pé. © Peladeiro {new Date().getFullYear()}</div>
          <Link to="/auth" className="font-bold text-sm uppercase tracking-wider hover:text-pitch">Entrar →</Link>
        </div>
      </footer>
    </div>
  );
}
