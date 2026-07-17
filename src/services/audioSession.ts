import {AudioModule, setAudioModeAsync} from 'expo-audio';

/**
 * Mic permission + audio session mode handling around expo-audio.
 * Recording needs allowsRecording: true; playback/TTS sounds better (louder,
 * main speaker) with it off, so we toggle around each recording.
 */

export async function requestMicPermission(): Promise<boolean> {
  const status = await AudioModule.requestRecordingPermissionsAsync();
  return status.granted;
}

export async function enterRecordingMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });
}

export async function exitRecordingMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
  });
}
