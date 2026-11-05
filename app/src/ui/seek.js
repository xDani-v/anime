// Lógica pura del reproductor: formato de tiempo y avance acelerado. Sin DOM (se prueba con node --test).

export const INTRO_SKIP_SECONDS = 85;

/** 75 -> "1:15"; 3725 -> "1:02:05". Valores no válidos -> "0:00". */
export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const t = Math.floor(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Salto en segundos según cuántas pulsaciones rápidas seguidas lleva el usuario. */
export function seekStep(rapid) {
  if (rapid < 3) return 10;
  if (rapid < 8) return 30;
  return 60;
}

/** Destino de un avance, acotado a [0, duración]. */
export function seekTarget(base, dir, step, duration) {
  const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
  return Math.min(max, Math.max(0, base + dir * step));
}

/** ¿Mostrar el botón "Saltar intro"? Solo al inicio de episodios largos y si no se usó ya. */
export function showSkipIntro(currentTime, duration, used) {
  return !used && Number.isFinite(duration) && duration > 600 && currentTime >= 3 && currentTime <= 210;
}
