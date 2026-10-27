import Link from "next/link";
import Header from "@/components/Header";
import MascotArt from "@/components/MascotArt";
import Pricing from "@/components/Pricing";

const FEATURES = [
  { t: "Reacciona sola", d: "Saluda a quien entra, agradece regalos y follows, celebra y baila con comandos del chat." },
  { t: "Sin saturar", d: "Agrupa likes y entradas, ignora spam y repetidos, y prioriza lo importante como los regalos grandes." },
  { t: "Tu estilo", d: "Colores, accesorio, tamaño, posición, voz y frases propias para cada tipo de evento." },
  { t: "Todas tus plataformas", d: "TikTok LIVE, YouTube, Twitch y Facebook al mismo tiempo, según tu plan." },
  { t: "Fácil en OBS", d: "Copias una URL en una fuente de navegador y listo. Sirve en cualquier programa que acepte fuentes de navegador." },
  { t: "Pagas lo que usas", d: "Solo cuentan los minutos con un directo activo. Probar y ensayar es gratis." },
];

export default function Home() {
  return (
    <>
      <Header />
      <main className="wrap">
        <section className="hero">
          <div>
            <h1>Una mascota que anima tus directos por ti</h1>
            <p className="lead">Saluda, agradece regalos, festeja follows y responde al chat mientras tú te concentras en transmitir.</p>
            <div className="row">
              <Link href="/panel" className="btn primary lg">Crear mi mascota gratis</Link>
              <Link href="/planes" className="btn lg">Ver planes</Link>
            </div>
            <div className="platforms">
              <span className="pill"><i style={{ background: "#ff0050" }} />TikTok LIVE <em className="muted">(experimental)</em></span>
              <span className="pill"><i style={{ background: "#ff0000" }} />YouTube Live</span>
              <span className="pill"><i style={{ background: "#9146ff" }} />Twitch</span>
              <span className="pill"><i style={{ background: "#1877f2" }} />Facebook Live</span>
            </div>
          </div>
          <div className="hero-art"><MascotArt state="baile" /></div>
        </section>

        <section className="features">
          {FEATURES.map((f) => (
            <div key={f.t} className="card">
              <h3>{f.t}</h3>
              <p className="muted small" style={{ margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </section>

        <h2 className="section-title" id="precios">Planes</h2>
        <p className="muted" style={{ marginTop: 0 }}>Precios en pesos mexicanos. Cancela cuando quieras.</p>
        <Pricing />

        <p className="footer">
          TikTok LIVE se conecta con una herramienta no oficial: puede fallar si TikTok cambia su servicio. YouTube, Twitch y Facebook usan sus APIs oficiales.
          En Facebook solo se leen los directos de páginas.
        </p>
      </main>
    </>
  );
}
