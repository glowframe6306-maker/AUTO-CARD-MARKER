let mediaStream: MediaStream | null = null;

export const mediaStreamRef = {
  current: null as MediaStream | null,
};

export async function initMediaStream(): Promise<MediaStream | null> {
  if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
    mediaStream = stream;
    mediaStreamRef.current = stream;
    return stream;
  } catch (e) {
    return null;
  }
}

export function getMediaStream(): MediaStream | null {
  return mediaStreamRef.current;
}

export function isStreamUsable(stream: MediaStream | null): boolean {
  if (!stream) return false;
  const tracks = stream.getTracks();
  if (!tracks.length) return false;
  return tracks.every((t) => t.readyState === "live" && t.enabled);
}

export function clearMediaStream() {
  if (mediaStreamRef.current) {
    try {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    } catch (e) {
      // ignore
    }
  }
  mediaStreamRef.current = null;
  mediaStream = null;
}
