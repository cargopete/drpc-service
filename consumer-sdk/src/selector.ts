import type { Provider } from "./types.js";

/**
 * Weighted random provider selection.
 *
 * Selection probability is proportional to `qosScore`. Falls back to uniform
 * random if all scores are zero (e.g. first request before any latency data).
 */
export function selectProvider(providers: Provider[]): Provider {
  if (providers.length === 0) {
    throw new Error("selectProvider: no providers available");
  }

  const total = providers.reduce((sum, p) => sum + p.qosScore, 0);

  if (total === 0) {
    return providers[Math.floor(Math.random() * providers.length)];
  }

  let cursor = Math.random() * total;
  for (const p of providers) {
    cursor -= p.qosScore;
    if (cursor <= 0) return p;
  }

  return providers[providers.length - 1];
}

/**
 * Update a provider's QoS score using an exponential moving average.
 *
 * @param current  Existing score (0..1).
 * @param latencyMs Observed round-trip latency in milliseconds.
 * @param alpha    EMA smoothing factor (default 0.1 — slow adaptation).
 */
export function updateQosScore(
  current: number,
  latencyMs: number,
  alpha = 0.1
): number {
  // Map latency to a 0..1 score: 50 ms → ~1.0, 2000 ms → ~0.0.
  const latencyScore = Math.max(0, 1 - latencyMs / 2000);
  return current * (1 - alpha) + latencyScore * alpha;
}
