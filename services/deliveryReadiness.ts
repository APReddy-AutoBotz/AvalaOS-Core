export type DeliveryProjectIndexReadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export function deliveryReadCompletionMatches(input: {
  requestSequence: number;
  requestAuthorityKey: string;
  currentSequence: number;
  currentAuthorityKey: string;
}) {
  return input.requestSequence === input.currentSequence
    && input.requestAuthorityKey === input.currentAuthorityKey;
}

export function visibleDeliveryProjectIndexReadiness(input: {
  server: boolean;
  currentAuthorityKey: string;
  stateAuthorityKey: string | null;
  state: DeliveryProjectIndexReadState;
  error: string | null;
}) {
  if (input.server && input.stateAuthorityKey !== input.currentAuthorityKey) {
    return { state: 'loading' as const, error: null };
  }
  return { state: input.state, error: input.error };
}
