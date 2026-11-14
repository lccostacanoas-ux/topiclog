/**
 * TopicLog • Sinal Sonoro de Notificação e Novas Mensagens
 * Utiliza Web Audio API nativa com oscilador sintetizado (dois tons suaves D5 -> A5),
 * sem dependência de arquivos externos .mp3 e com suporte total a navegadores modernos e mobile.
 */
export function playNotificationSound(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Primeiro tom (Ré 5 - 587.33 Hz) por 100ms, seguido de Lá 5 (880 Hz)
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Falha silenciosa caso o navegador restrinja reprodução antes de interação
  }
}
