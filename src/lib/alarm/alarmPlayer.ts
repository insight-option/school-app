import { Platform, Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { create } from 'zustand';

const ALARM_SOURCE = require('../../../assets/sounds/alarm.wav');

let player: AudioPlayer | null = null;
let vibrating = false;

/** Loop the alarm sound at full volume, also in iOS silent mode, and vibrate continuously. */
export async function startAlarm(): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: true, allowsRecording: false });
  } catch (e) {
    console.warn('audio mode', e);
  }
  try {
    if (!player) {
      player = createAudioPlayer(ALARM_SOURCE, { updateInterval: 1000 });
    }
    player.loop = true;
    player.volume = 1;
    player.muted = false;
    await player.seekTo(0);
    player.play();
  } catch (e) {
    console.warn('alarm play failed', e);
  }
  if (Platform.OS !== 'web' && !vibrating) {
    vibrating = true;
    Vibration.vibrate([0, 800, 400, 800, 400], true);
  }
}

export function stopAlarm(): void {
  try {
    player?.pause();
    player?.remove();
  } catch {
    // ignore
  }
  player = null;
  if (vibrating) {
    Vibration.cancel();
    vibrating = false;
  }
}

export type ActiveAlarm = {
  tripStopId: string;
  test?: boolean;
  driverName?: string;
  plate?: string;
  etaSeconds?: number | null;
  startedAt: number;
};

type AlarmState = { active: ActiveAlarm | null; show: (a: Omit<ActiveAlarm, 'startedAt'>) => void; dismiss: () => void };

/** Which alarm is currently ringing (drives the full-screen alarm route). */
export const useAlarmStore = create<AlarmState>((set) => ({
  active: null,
  show: (a) => set({ active: { ...a, startedAt: Date.now() } }),
  dismiss: () => set({ active: null }),
}));

export { alarmUiState, shouldRing, type AlarmUiState } from '../rules/alarm';
