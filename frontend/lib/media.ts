let mediaStream: MediaStream | null = null;

export const mediaStreamRef = {
  current: null as MediaStream | null,
};

const securityVerificationMediaConstraints: MediaStreamConstraints = {
  video: { facingMode: "user" },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
};

export function logSecurityVerificationMediaState(
  label: string,
  stream: MediaStream | null
) {
  const audioTracks = stream?.getAudioTracks() ?? [];
  const videoTracks = stream?.getVideoTracks() ?? [];
  const audioTrack = audioTracks[0];
  const videoTrack = videoTracks[0];

  console.info(`[SECURITY-VERIFICATION-AUDIO] ${label}`, {
    audioTrackCount: audioTracks.length,
    videoTrackCount: videoTracks.length,
    audioEnabled: audioTrack?.enabled ?? false,
    audioReadyState: audioTrack?.readyState ?? "none",
    audioMuted: audioTrack?.muted ?? false,
    videoEnabled: videoTrack?.enabled ?? false,
    videoReadyState: videoTrack?.readyState ?? "none",
    isSecureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    protocol: typeof window !== "undefined" ? window.location.protocol : "unknown",
  });
}

export async function getPermissionState(
  permissionName: "camera" | "microphone"
): Promise<PermissionState | "unsupported"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unsupported";
  }

  try {
    const descriptor = {
      name: permissionName,
    } as unknown as PermissionDescriptor;

    const permission = await navigator.permissions.query(descriptor);
    return permission.state;
  } catch {
    return "unsupported";
  }
}

export async function hasGrantedMediaPermissions(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  const cameraState = await getPermissionState("camera");
  const microphoneState = await getPermissionState("microphone");

  const cameraGranted = cameraState === "granted";
  const microphoneGranted = microphoneState === "granted";

  return cameraGranted && microphoneGranted;
}

export async function requestSecurityVerificationStream(): Promise<MediaStream> {
  if (mediaStreamRef.current && isStreamUsable(mediaStreamRef.current)) {
    return mediaStreamRef.current;
  }

  const cameraState = await getPermissionState("camera");
  const microphoneState = await getPermissionState("microphone");
  const permissionAlreadyGranted = cameraState === "granted" && microphoneState === "granted";

  const stream = await navigator.mediaDevices.getUserMedia(
    securityVerificationMediaConstraints
  );
  mediaStreamRef.current = stream;
  mediaStream = stream;
  logSecurityVerificationMediaState("getUserMedia:securityVerification", stream);
  return stream;
}

function hasUsableSecurityVerificationTracks(stream: MediaStream) {
  const videoTracks = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks();
  return (
    videoTracks.length > 0 &&
    audioTracks.length > 0 &&
    videoTracks.every((track) => track.readyState === "live" && track.enabled) &&
    audioTracks.every(
      (track) =>
        track.readyState === "live" && track.enabled && !track.muted
    )
  );
}

export async function initMediaStream(): Promise<MediaStream | null> {
  if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await requestSecurityVerificationStream();

    if (!hasUsableSecurityVerificationTracks(stream)) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }

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
  const videoTracks = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks();
  return (
    videoTracks.length > 0 &&
    audioTracks.length > 0 &&
    videoTracks.every((track) => track.readyState === "live" && track.enabled) &&
    audioTracks.every(
      (track) => track.readyState === "live" && track.enabled && !track.muted
    )
  );
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
