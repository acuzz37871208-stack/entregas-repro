// Única fuente de verdad para cupos. Para sumar una genética, agregarla acá.
export const CONFIG = {
  LIMITE_MENSUAL: 20, // gramos por paciente por mes (se puede pisar con pacientes/{clave}/limiteMensual)
  GENETICAS: [
    { nombre: "Purple Queen", maxMensual: 20 },
    { nombre: "Asteria S1", maxMensual: 5 },
  ],
};
