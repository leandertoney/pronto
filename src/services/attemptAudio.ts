import {Directory, File, Paths} from 'expo-file-system';

/**
 * The recorder used in the conversation screen is a single long-lived
 * instance (created once via useAudioRecorder), so expo-audio writes every
 * recording to the SAME underlying file path. The next recording overwrites
 * whatever was there, so a Spanish repeat attempt has to be copied out to a
 * stable, uniquely-named file immediately if the user is going to be able to
 * hear it back after moving on to the next phrase.
 */

const ATTEMPTS_DIRNAME = 'attempt-audio';

function attemptsDir(): Directory {
  const dir = new Directory(Paths.cache, ATTEMPTS_DIRNAME);
  if (!dir.exists) {
    dir.create({intermediates: true, idempotent: true});
  }
  return dir;
}

/** Copy a just-recorded attempt to a stable per-entry file, returning its URI. */
export async function persistAttemptAudio(sourceUri: string, entryId: string): Promise<string> {
  const source = new File(sourceUri);
  const dest = new File(attemptsDir(), `${entryId}.m4a`);
  if (dest.exists) {
    dest.delete();
  }
  source.copy(dest);
  return dest.uri;
}
