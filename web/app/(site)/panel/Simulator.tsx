"use client";
// Simulador: eventos de mentira que pasan por las mismas reglas, límites y cola que los reales. Gratis.
import { useState } from "react";

const NAMES = ["LunaGamer", "pacoelflaco", "Sofi_22", "ElTioMemo", "karla.mx", "NachoPlays", "DanaUwU", "Rulo77", "mariposa_azul", "Toño"];
const randomName = () => `${NAMES[Math.floor(Math.random() * NAMES.length)]}${Math.random() < 0.4 ? Math.floor(Math.random() * 99) : ""}`;

type Evt = Record<string, unknown>;

export default function Simulator({ mascotName, call }: { mascotName: string; call: (path: string, body: unknown) => Promise<unknown> }) {
  const [user, setUser] = useState(randomName);
  const [chat, setChat] = useState("");
  const [gift, setGift] = useState("Rosa");
  const [amount, setAmount] = useState(1);
  const [err, setErr] = useState("");

  const send = (evt: Evt | Evt[], keepName = false) => {
    setErr("");
    call("/panel/event", evt).catch((e) => setErr((e as Error).message));
    if (!keepName && !Array.isArray(evt)) setUser(randomName());
  };
  const id = () => `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <section className="card">
      <h2>Simulador</h2>
      <p className="muted tiny" style={{ marginTop: 0 }}>Prueba sin estar en vivo y sin gastar horas.</p>
      <div className="row">
        <input className="grow" type="text" maxLength={40} value={user} onChange={(e) => setUser(e.target.value)} aria-label="Usuario" />
        <button className="btn sm ghost" title="Otro nombre" onClick={() => setUser(randomName())}>↻</button>
      </div>
      <div className="btns" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => send({ type: "join", user })}>Entrada</button>
        <button className="btn sm" onClick={() => send({ type: "follow", user })}>Follow</button>
        <button className="btn sm" onClick={() => send({ type: "like", user, amount: 10 }, true)}>+10 likes</button>
        <button className="btn sm" onClick={() => send({ type: "chat", user, text: `hola ${mascotName}!` })}>Mención</button>
        <button className="btn sm" onClick={() => send({ type: "sub", user })}>Suscripción</button>
        <button className="btn sm" onClick={() => send({ type: "purchase", user, gift: "una taza", id: id() })}>Compra</button>
        <button className="btn sm" title="Lo que dice cuando nadie interactúa" onClick={() => call("/panel/control", { action: "idle" }).catch((e) => setErr((e as Error).message))}>Invitación</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="grow" type="text" maxLength={200} placeholder="Comentario (prueba !baila)" value={chat} onChange={(e) => setChat(e.target.value)} />
        <button className="btn sm" onClick={() => send({ type: "chat", user, text: chat || "hola" })}>Enviar</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="grow" type="text" maxLength={30} value={gift} onChange={(e) => setGift(e.target.value)} aria-label="Regalo" />
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 1)} style={{ width: 80 }} aria-label="Cantidad" />
        <button className="btn sm" onClick={() => send({ type: "gift", user, gift, amount, id: id() })}>Regalo</button>
      </div>
      <h3>Juego (manual)</h3>
      <div className="btns">
        <button className="btn sm" onClick={() => send({ type: "win", id: id() })}>Victoria</button>
        <button className="btn sm" onClick={() => send({ type: "lose", id: id() })}>Derrota</button>
        <button className="btn sm" onClick={() => send({ type: "scare", id: id() })}>Susto</button>
      </div>
      <h3>Saturación</h3>
      <div className="btns">
        <button className="btn sm ghost" onClick={() => send(Array.from({ length: 30 }, () => ({ type: "join", user: randomName() })))}>30 entradas</button>
        <button className="btn sm ghost" onClick={() => send(Array.from({ length: 300 }, () => ({ type: "like", user: randomName() })))}>300 likes</button>
        <button className="btn sm ghost" onClick={() => send(Array.from({ length: 10 }, () => ({ type: "chat", user, text: `${mascotName} ${mascotName}!!` })))}>Spam ×10</button>
        <button className="btn sm ghost" onClick={() => send(Array.from({ length: 5 }, () => ({ type: "gift", user, gift, amount: 1, id: id() })))}>Combo ×5</button>
      </div>
      {err && <div className="err tiny" style={{ marginTop: 8 }}>{err}</div>}
    </section>
  );
}
