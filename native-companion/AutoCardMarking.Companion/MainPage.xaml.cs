#if ANDROID
using Android.Webkit;
#endif

namespace AutoCardMarking.Companion;

public partial class MainPage : ContentPage
{
#if ANDROID
    private const string WebsiteUrl = "http://10.0.2.2:3000";
#else
    private const string WebsiteUrl = "http://localhost:3000";
#endif

    public MainPage()
    {
        InitializeComponent();
        WebsiteWebView.Source = WebsiteUrl;
    }

#if ANDROID
    protected override void OnHandlerChanged()
    {
        base.OnHandlerChanged();

        if (Handler?.PlatformView is Android.Webkit.WebView platformWebView)
        {
            var settings = platformWebView.Settings;
            settings.JavaScriptEnabled = true;
            settings.DomStorageEnabled = true;
            settings.DatabaseEnabled = true;
            settings.AllowFileAccess = false;
            settings.AllowContentAccess = true;
            settings.JavaScriptCanOpenWindowsAutomatically = true;
            settings.SetSupportMultipleWindows(false);
            settings.MixedContentMode = MixedContentHandling.AlwaysAllow;
            settings.CacheMode = CacheModes.Normal;

            platformWebView.SetWebChromeClient(new PermissionAwareWebChromeClient());
            platformWebView.SetWebViewClient(new WebViewClient());
        }
    }
#endif
}
