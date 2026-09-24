#if ANDROID
using Android;
using Android.App;
using Android.Content.PM;
using Android.Webkit;

namespace AutoCardMarking.Companion;

public class PermissionAwareWebChromeClient : WebChromeClient
{
    public override void OnPermissionRequest(PermissionRequest? request)
    {
        if (request is null)
        {
            return;
        }

        try
        {
            var resources = request.GetResources();

            if (resources == null || resources.Length == 0)
            {
                request.Deny();
                return;
            }

            var activity = Platform.CurrentActivity;

            if (activity == null)
            {
                request.Deny();
                return;
            }

            var allowAudio = resources.Contains(
                PermissionRequest.ResourceAudioCapture,
                StringComparer.Ordinal
            );

            var allowVideo = resources.Contains(
                PermissionRequest.ResourceVideoCapture,
                StringComparer.Ordinal
            );

            if (!allowAudio && !allowVideo)
            {
                request.Deny();
                return;
            }

            var hasMicrophonePermission =
                AndroidX.Core.Content.ContextCompat.CheckSelfPermission(
                    activity,
                    Manifest.Permission.RecordAudio
                ) == Permission.Granted;

            var hasCameraPermission =
                AndroidX.Core.Content.ContextCompat.CheckSelfPermission(
                    activity,
                    Manifest.Permission.Camera
                ) == Permission.Granted;

            var grantedResources = new List<string>();

            if (allowAudio && hasMicrophonePermission)
            {
                grantedResources.Add(
                    PermissionRequest.ResourceAudioCapture
                );
            }

            if (allowVideo && hasCameraPermission)
            {
                grantedResources.Add(
                    PermissionRequest.ResourceVideoCapture
                );
            }

            if ((allowAudio && !hasMicrophonePermission) ||
                (allowVideo && !hasCameraPermission) ||
                grantedResources.Count == 0)
            {
                request.Deny();
                return;
            }

            MainThread.BeginInvokeOnMainThread(() =>
            {
                try
                {
                    request.Grant(grantedResources.ToArray());
                }
                catch
                {
                    request.Deny();
                }
            });
        }
        catch
        {
            try
            {
                request.Deny();
            }
            catch
            {
            }
        }
    }
}
#endif
