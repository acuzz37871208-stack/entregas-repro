import {
  db, ref, push,
  auth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "./firebase.js";

onAuthStateChanged(auth, (user) => {
  document.getElementById("login-box").style.display = user ? "none" : "block";
  document.getElementById("panel").style.display = user ? "block" : "none";
});

document.getElementById("login").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Error de login:", error);
    errorEl.textContent = "Email o contraseña incorrectos";
  }
};

document.getElementById("logout").onclick = () => signOut(auth);

document.getElementById("guardar").onclick = async () => {
  const persona = document.getElementById("persona").value.trim();
  const genetica = document.getElementById("genetica").value.trim();
  const gramos = parseFloat(document.getElementById("gramos").value);

  if (!persona || !genetica || isNaN(gramos)) {
    alert("Completar datos");
    return;
  }

  try {
    await push(ref(db, "entregas"), {
      persona,
      genetica,
      gramos,
      fecha: new Date().toISOString(),
    });

    document.getElementById("persona").value = "";
    document.getElementById("genetica").value = "";
    document.getElementById("gramos").value = "";

    alert("Guardado correctamente");
  } catch (error) {
    console.error("Error al guardar:", error);
    alert("No se pudo guardar. Revisa la consola.");
  }
};
