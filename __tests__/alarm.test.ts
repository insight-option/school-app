import { alarmButtonState, alarmUiState, shouldRepeat, shouldRing } from '../src/lib/rules/alarm';

describe('alarm state machine', () => {
  it('rings only while ALARMED and not acknowledged locally', () => {
    expect(alarmUiState('PENDING', false)).toBe('idle');
    expect(alarmUiState('ALARMED', false)).toBe('ringing');
    expect(alarmUiState('ALARMED', true)).toBe('acknowledged');
    expect(alarmUiState('ACKNOWLEDGED', false)).toBe('acknowledged');
    expect(alarmUiState('BOARDED', false)).toBe('boarded');
    expect(alarmUiState('DROPPED', false)).toBe('boarded');
    expect(alarmUiState('SKIPPED', false)).toBe('ended');
    expect(alarmUiState('ABSENT', false)).toBe('ended');
    expect(shouldRing('ringing')).toBe(true);
    expect(shouldRing('acknowledged')).toBe(false);
    expect(shouldRing('idle')).toBe(false);
  });

  it('server repeat loop stops on acknowledge / boarding / trip end / max attempts', () => {
    expect(shouldRepeat('ALARMED', 'ACTIVE', 0, 5)).toBe(true);
    expect(shouldRepeat('ALARMED', 'ACTIVE', 4, 5)).toBe(true);
    expect(shouldRepeat('ALARMED', 'ACTIVE', 5, 5)).toBe(false);
    expect(shouldRepeat('ACKNOWLEDGED', 'ACTIVE', 1, 5)).toBe(false);
    expect(shouldRepeat('BOARDED', 'ACTIVE', 1, 5)).toBe(false);
    expect(shouldRepeat('ALARMED', 'COMPLETED', 1, 5)).toBe(false);
    expect(shouldRepeat('ALARMED', 'ACTIVE', 0, 0)).toBe(false);
  });

  it('driver button reflects the stop status', () => {
    expect(alarmButtonState('PENDING')).toBe('alarm');
    expect(alarmButtonState('ALARMED')).toBe('waiting');
    expect(alarmButtonState('ACKNOWLEDGED')).toBe('acknowledged');
    expect(alarmButtonState('BOARDED')).toBe('disabled');
    expect(alarmButtonState(undefined)).toBe('disabled');
  });
});
