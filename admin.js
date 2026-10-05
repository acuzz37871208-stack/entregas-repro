import {
  db, ref, push, get, set, update, onValue,
  auth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "./firebase.js";
import { CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);
const normalizar = (v) =>
  String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const esc = (v) =>
  String(v || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

let pacientes = {};
let unsub = null;

onAuthStateChanged(auth, (user) => {
  $("login-box").style.display = user ? "none" : "block";
  $("panel").style.display = user ? "block" : "none";
  if (unsub) unsub();
  unsub = null;
  if (user) {
    unsub = onValue(ref(db, "pacientes"), (snap) => {
      pacientes = snap.val() || {};
      render();
    });
  }
});

$("login").onclick = async () => {
  const errorEl = $("login-error");
  errorEl.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (error) {
    console.error("Error de login:", error);
    errorEl.textContent = "Email o contraseña incorrectos";
  }
};

$("logout").onclick = () => signOut(auth);

function render() {
  const sel = $("re-paciente");
  const previo = sel.value;
  sel.innerHTML = Object.entries(pacientes)
    .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre))
    .map(([pin, p]) => `<option value="${esc(pin)}">${esc(p.nombre)} · ${esc(pin)}</option>`)
    .join("");
  if (previo && pacientes[previo]) sel.value = previo;

  const gen = $("re-genetica");
  if (!gen.options.length) {
    gen.innerHTML = CONFIG.GENETICAS.map((g) => `<option>${esc(g.nombre)}</option>`).join("");
  }

  const pendientes = [];
  for (const [pin, p] of Object.entries(pacientes)) {
    for (const [id, pedido] of Object.entries(p.pedidos || {})) {
      if (pedido.estado === "pendiente") pendientes.push({ pin, id, nombre: p.nombre, ...pedido });
    }
  }
  pendientes.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  $("pedidos").innerHTML = pendientes.length
    ? pendientes.map((p) => `
        <div class="fila">
          <div>${esc(p.nombre)} · ${esc(p.genetica)} · ${Number(p.gramos)}g
            <small>${new Date(p.fecha).toLocaleString("es-AR")}</small></div>
          <div class="acciones">
            <button data-accion="entregar" data-pin="${esc(p.pin)}" data-id="${esc(p.id)}">Entregar</button>
            <button class="cancelar" data-accion="cancelar" data-pin="${esc(p.pin)}" data-id="${esc(p.id)}">Cancelar</button>
          </div>
        </div>`).join("")
    : `<div class="empty">Sin pedidos pendientes.</div>`;
}

$("pedidos").onclick = async (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;
  const { accion, pin, id } = btn.dataset;
  const pedido = pacientes[pin]?.pedidos?.[id];
  if (!pedido || pedido.estado !== "pendiente") return;
  btn.disabled = true;

  try {
    if (accion === "entregar") {
      const key = push(ref(db, `pacientes/${pin}/entregas`)).key;
      await update(ref(db), {
        [`pacientes/${pin}/entregas/${key}`]: {
          genetica: pedido.genetica,
          gramos: pedido.gramos,
          fecha: new Date().toISOString(),
        },
        [`pacientes/${pin}/pedidos/${id}/estado`]: "entregado",
      });
    } else {
      await set(ref(db, `pacientes/${pin}/pedidos/${id}/estado`), "cancelado");
    }
  } catch (error) {
    console.error(error);
    alert("No se pudo actualizar el pedido.");
    btn.disabled = false;
  }
};

$("re-guardar").onclick = async () => {
  const pin = $("re-paciente").value;
  const genetica = $("re-genetica").value;
  const gramos = parseFloat($("re-gramos").value);
  if (!pin || !genetica || !(gramos > 0)) return alert("Completar datos");

  try {
    await push(ref(db, `pacientes/${pin}/entregas`), {
      genetica, gramos, fecha: new Date().toISOString(),
    });
    $("re-gramos").value = "";
    alert("Guardado correctamente");
  } catch (error) {
    console.error("Error al guardar:", error);
    alert("No se pudo guardar. Revisa la consola.");
  }
};

$("np-crear").onclick = async () => {
  const nombre = $("np-nombre").value.trim();
  const pin = $("np-pin").value.trim();
  if (!nombre || !/^\d{4}$/.test(pin)) return alert("Nombre y clave de 4 dígitos");
  if (pacientes[pin]) return alert("Esa clave ya está en uso");

  try {
    await set(ref(db, `pacientes/${pin}`), {
      nombre,
      limiteMensual: CONFIG.LIMITE_MENSUAL,
      creado: new Date().toISOString(),
    });
    $("np-nombre").value = "";
    $("np-pin").value = "";
  } catch (error) {
    console.error(error);
    alert("No se pudo crear el paciente.");
  }
};

// Copia las entregas del nodo viejo /entregas al historial de cada paciente (idempotente)
$("migrar").onclick = async () => {
  const legacy = (await get(ref(db, "entregas"))).val() || {};
  const porNombre = Object.fromEntries(
    Object.entries(pacientes).map(([pin, p]) => [normalizar(p.nombre), pin])
  );
  const cambios = {};
  let ok = 0, sin = 0;

  for (const [key, e] of Object.entries(legacy)) {
    const pin = porNombre[normalizar(e.persona)];
    if (!pin) { sin++; continue; }
    cambios[`pacientes/${pin}/entregas/${key}`] = {
      genetica: e.genetica, gramos: Number(e.gramos) || 0, fecha: e.fecha,
    };
    ok++;
  }
  if (ok) await update(ref(db), cambios);
  $("info").textContent = `${ok} migradas, ${sin} sin paciente asociado (creá el paciente con el mismo nombre y reintentá).`;
};
