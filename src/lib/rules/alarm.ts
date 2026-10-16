/** Alarm state machine as seen by the student device (pure, unit-tested). */
export type AlarmUiState = 'idle' | 'ringing' | 'acknowledged' | 'boarded' | 'ended';

export function alarmUiState(stopStatus: string | null | undefined, acknowledgedLocally: boolean): AlarmUiState {
  switch (stopStatus) {
    case 'ALARMED':
      return acknowledgedLocally ? 'acknowledged' : 'ringing';
    case 'ACKNOWLEDGED':
      return 'acknowledged';
    case 'BOARDED':
    case 'DROPPED':
      return 'boarded';
    case 'SKIPPED':
    case 'ABSENT':
      return 'ended';
    default:
      return 'idle';
  }
}

/** The alarm keeps ringing only while the stop is ALARMED and the user has not acknowledged. */
export function shouldRing(state: AlarmUiState): boolean {
  return state === 'ringing';
}

/** Server-side repeat loop decision: continue while still ALARMED and attempts remain. */
export function shouldRepeat(stopStatus: string | null | undefined, tripStatus: string | null | undefined, attempt: number, maxRepeats: number): boolean {
  if (stopStatus !== 'ALARMED') return false;
  if (tripStatus !== 'ACTIVE') return false;
  return attempt < maxRepeats;
}

/** Driver-side alarm button state. */
export function alarmButtonState(stopStatus: string | null | undefined): 'alarm' | 'waiting' | 'acknowledged' | 'disabled' {
  switch (stopStatus) {
    case 'PENDING':
      return 'alarm';
    case 'ALARMED':
      return 'waiting';
    case 'ACKNOWLEDGED':
      return 'acknowledged';
    default:
      return 'disabled';
  }
}
