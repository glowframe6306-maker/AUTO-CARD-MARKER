#if ANDROID
using Android.App;
using Android.Webkit;

namespace AutoCardMarking.Companion;

public class PermissionAwareWebChromeClient : WebChromeClient
{
    public override void OnPermissionRequest(PermissionRequest? request)
    {
        try
        {
            if (request is null)
            {
                return;
            }

            var resources = request.GetResources();
            if (resources == null || resources.Length == 0)
            {
                request.Deny();
                return;
            }

            var allowed = resources.Contains("android.webkit.resource.AUDIO_CAPTURE") ||
                          resources.Contains("android.webkit.resource.VIDEO_CAPTURE");

            if (!allowed)
            {
                request.Deny();
                return;
            }

            request.Grant(resources);
        }
        catch
        {
            request.Deny();
        }
    }
}
#endif
