export interface AnomalySignal {
  triggered: boolean;
  reason: string | null;
}

export function detectAnomaly(): AnomalySignal {
  return {
    triggered: false,
    reason: null,
  };
}
