import { db, ref, push, onValue } from "./firebase.js";
import { CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);
const el = {
  login: $("login"), app: $("app"), pin: $("pin"), error: $("login-error"),
  salir: $("salir"), disponible: $("disponible"), detalle: $("detalle"),
  opciones: $("opciones"), gramos: $("gramos"), pedir: $("pedir"),
  msg: $("msg"), lista: $("lista"),
};

const MAX_FALLOS = 5;
const BLOQUEO_MS = 30000;

let fallos = 0;
let bloqueadoHasta = 0;
let unsub = null;
let clave = null;
let datos = null;
let seleccion = null;
let conectado = false;
let geneticasActuales = [];

const normalizar = (v) =>
  String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const suma = (arr) => arr.reduce((s, x) => s + x.gramos, 0);
const fmt = (v) => `${Number(num(v).toFixed(1))}g`;
const fechaCorta = (iso) => new Date(iso).toLocaleDateString("es-AR");
const esc = (v) =>
  String(v || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const mostrar = (logueado) => {
  el.login.hidden = logueado;
  el.app.hidden = !logueado;
};

const mensaje = (texto, error = false) => {
  el.msg.textContent = texto;
  el.msg.className = error ? "msg error" : "msg";
};

function cerrarSesion() {
  if (unsub) unsub();
  unsub = null;
  clave = datos = seleccion = null;
  conectado = false;
  sessionStorage.removeItem("pin");
  el.pin.value = "";
  mensaje("");
  mostrar(false);
}

function falloLogin() {
  fallos += 1;
  if (fallos >= MAX_FALLOS) {
    fallos = 0;
    bloqueadoHasta = Date.now() + BLOQUEO_MS;
    el.error.textContent = "Demasiados intentos. Esperá 30 segundos.";
  } else {
    el.error.textContent = "Clave incorrecta.";
  }
}

function entrar(pin) {
  if (Date.now() < bloqueadoHasta) {
    el.error.textContent = `Demasiados intentos. Probá en ${Math.ceil((bloqueadoHasta - Date.now()) / 1000)}s.`;
    el.pin.value = "";
    return;
  }
  if (unsub) unsub();
  conectado = false;

  unsub = onValue(
    ref(db, `pacientes/${pin}`),
    (snap) => {
      if (!snap.exists()) {
        const estabaAdentro = conectado;
        cerrarSesion();
        if (!estabaAdentro) falloLogin();
        return;
      }
      datos = snap.val();
      clave = pin;
      if (!conectado) {
        conectado = true;
        fallos = 0;
        el.error.textContent = "";
        sessionStorage.setItem("pin", pin);
        el.salir.textContent = `${datos.nombre} · Salir`;
        mostrar(true);
      }
      render();
    },
    () => {
      cerrarSesion();
      el.error.textContent = "No se pudo conectar. Reintentá.";
    }
  );
}

function render() {
  const ahora = new Date();
  const delMes = (iso) => {
    const d = new Date(iso);
    return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  };

  const entregas = Object.values(datos.entregas || {}).map((e) => ({ ...e, gramos: num(e.gramos), estado: "entregado" }));
  const pedidos = Object.values(datos.pedidos || {}).map((p) => ({ ...p, gramos: num(p.gramos) }));

  // Cuentan contra el cupo: entregas + pedidos pendientes del mes en curso
  const consumos = [...entregas, ...pedidos.filter((p) => p.estado === "pendiente")].filter((c) => delMes(c.fecha));
  const limite = num(datos.limiteMensual) || CONFIG.LIMITE_MENSUAL;
  const disponible = Math.max(0, limite - suma(consumos));
  const pendiente = suma(consumos.filter((c) => c.estado === "pendiente"));

  el.disponible.textContent = fmt(disponible);
  el.detalle.textContent = pendiente > 0
    ? `de ${fmt(limite)} · ${fmt(pendiente)} en pedidos pendientes`
    : `de ${fmt(limite)}`;

  geneticasActuales = CONFIG.GENETICAS.map((g) => {
    const usado = suma(consumos.filter((c) => normalizar(c.genetica) === normalizar(g.nombre)));
    const cupo = Math.min(g.maxMensual, limite);
    return { ...g, libre: Math.max(0, Math.min(disponible, cupo - usado)) };
  });

  const elegida = geneticasActuales.find((g) => g.nombre === seleccion && g.libre > 0);
  if (!elegida) seleccion = null;

  el.opciones.innerHTML = geneticasActuales.map((g) => `
    <button type="button" class="opcion ${g.nombre === seleccion ? "activa" : ""}" data-nombre="${esc(g.nombre)}" ${g.libre <= 0 ? "disabled" : ""}>
      <strong>${esc(g.nombre)}</strong>
      <span>${fmt(g.libre)} disponibles</span>
    </button>
  `).join("");

  el.gramos.max = elegida ? elegida.libre : "";
  el.pedir.disabled = !seleccion;

  const historial = [
    ...entregas,
    ...pedidos.filter((p) => p.estado !== "entregado"), // los entregados ya figuran como entrega
  ]
    .filter((h) => !Number.isNaN(new Date(h.fecha).getTime()))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const etiqueta = { pendiente: "Pendiente", cancelado: "Cancelado" };
  el.lista.innerHTML = historial.length
    ? historial.map((h) => `
        <div class="item">
          <div>
            <strong>${esc(h.genetica || "Sin genética")}${etiqueta[h.estado] ? `<em class="tag ${h.estado}">${etiqueta[h.estado]}</em>` : ""}</strong>
            <span>${fechaCorta(h.fecha)}</span>
          </div>
          <b class="${h.estado}">${fmt(h.gramos)}</b>
        </div>
      `).join("")
    : `<div class="empty">Todavía no hay movimientos.</div>`;
}

el.pin.addEventListener("input", () => {
  el.pin.value = el.pin.value.replace(/\D/g, "").slice(0, 4);
  el.error.textContent = "";
  if (el.pin.value.length === 4) entrar(el.pin.value);
});

el.opciones.addEventListener("click", (e) => {
  const btn = e.target.closest(".opcion");
  if (!btn || btn.disabled) return;
  seleccion = btn.dataset.nombre;
  mensaje("");
  render();
});

el.pedir.addEventListener("click", async () => {
  const g = geneticasActuales.find((x) => x.nombre === seleccion);
  const gramos = parseFloat(el.gramos.value);
  if (!g) return mensaje("Elegí una genética.", true);
  if (!(gramos > 0)) return mensaje("Ingresá los gramos.", true);
  if (gramos > g.libre) return mensaje(`Máximo ${fmt(g.libre)} de ${g.nombre}.`, true);

  el.pedir.disabled = true;
  try {
    await push(ref(db, `pacientes/${clave}/pedidos`), {
      genetica: g.nombre,
      gramos,
      fecha: new Date().toISOString(),
      estado: "pendiente",
    });
    el.gramos.value = "";
    mensaje("Pedido enviado.");
  } catch (error) {
    console.error("Error al pedir:", error);
    mensaje("No se pudo enviar el pedido.", true);
  } finally {
    el.pedir.disabled = !seleccion;
  }
});

el.salir.addEventListener("click", cerrarSesion);

const guardado = sessionStorage.getItem("pin");
if (/^\d{4}$/.test(guardado || "")) entrar(guardado);
