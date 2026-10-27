"use client";
// Planes y recargas desde la base (tabla plans y hour_packs). Si hay sesión, muestra el plan actual.
import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase-browser";
import { hours, mxn, type HourPack, type Plan } from "@/lib/types";

interface Props {
  currentPlan?: string;
  onSubscribe?: (plan: Plan) => void;
  onBuyPack?: (pack: HourPack) => void;
  busy?: string;
}

export default function Pricing({ currentPlan, onSubscribe, onBuyPack, busy }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [packs, setPacks] = useState<HourPack[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!supabaseConfigured) return setErr("Falta configurar Supabase para mostrar los precios.");
    Promise.all([
      supabase().from("plans").select("*").order("sort"),
      supabase().from("hour_packs").select("*").order("sort"),
    ]).then(([p, h]) => {
      if (p.error || h.error) return setErr("No se pudieron cargar los precios.");
      setPlans(p.data as Plan[]);
      setPacks(h.data as HourPack[]);
    });
  }, []);

  if (err) return <div className="warn small">{err}</div>;

  return (
    <>
      <div className="plans">
        {plans.map((p) => (
          <div key={p.id} className={`card plan${currentPlan === p.id ? " current" : ""}`}>
            <strong style={{ fontSize: 18 }}>{p.name}</strong>
            <div className="price">{p.price_mxn > 0 ? <>${Number(p.price_mxn)}<small> MXN/mes</small></> : "Gratis"}</div>
            <ul>
              <li>{hours(p.minutes)} en vivo al mes</li>
              <li>{p.max_platforms === 1 ? "1 plataforma" : `Hasta ${p.max_platforms} plataformas`} a la vez</li>
              <li>{p.ai_designs > 0 ? `${p.ai_designs} mascota${p.ai_designs > 1 ? "s" : ""} creada${p.ai_designs > 1 ? "s" : ""} con IA al mes` : "Catálogo de mascotas e imagen propia"}</li>
              <li>Simulador y pruebas ilimitadas</li>
              {p.description && <li>{p.description}</li>}
            </ul>
            {currentPlan === p.id ? (
              <span className="pill ok"><i />Tu plan actual</span>
            ) : p.price_mxn > 0 && onSubscribe ? (
              <button className="btn primary" disabled={!!busy} onClick={() => onSubscribe(p)}>{busy === p.id ? "Abriendo Mercado Pago…" : `Elegir ${p.name}`}</button>
            ) : null}
          </div>
        ))}
      </div>
      {packs.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Horas extra</h2>
          <p className="muted small" style={{ marginTop: 0 }}>Se usan cuando se acaban las horas de tu plan. No caducan.</p>
          <div className="plans">
            {packs.map((h) => (
              <div key={h.id} className="card plan">
                <strong>{h.name}</strong>
                <div className="price">${Number(h.price_mxn)}<small> MXN</small></div>
                <span className="muted small">{mxn(h.price_mxn / (h.minutes / 60))} por hora</span>
                {onBuyPack && (
                  <button className="btn" disabled={!!busy} onClick={() => onBuyPack(h)}>{busy === h.id ? "Abriendo Mercado Pago…" : "Comprar"}</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
