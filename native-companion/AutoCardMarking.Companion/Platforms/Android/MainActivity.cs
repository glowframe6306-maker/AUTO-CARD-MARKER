using Android.Content;
using Android;
using Android.App;
using Android.Content.PM;
using Android.OS;
using AndroidX.Core.App;

namespace AutoCardMarking.Companion;

[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTop, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
    private const int RequiredPermissionsRequestCode = 1001;

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        EnsureRequiredPermissions();

        ForwardSecurityVerificationIntent(Intent);
    }

    protected override void OnNewIntent(Intent? intent)
    {
        base.OnNewIntent(intent);
        base.SetIntent(intent, null);
            ForwardSecurityVerificationIntent(intent);
    }

    private void ForwardSecurityVerificationIntent(Intent? intent)
    {
        if (intent is null)
        {
            return;
        }

        var sessionId = intent.GetStringExtra("securityVerificationSessionId");

        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return;
        }

        MainThread.BeginInvokeOnMainThread(() =>
        {
            try
            {
                if (Microsoft.Maui.Controls.Application.Current?.MainPage is MainPage mainPage)
                {
                    mainPage.HandleNativeSecurityVerificationSession(sessionId);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine(
                    $"Security Verification intent handoff failed: {ex.Message}"
                );
            }
        });
    }
    private void EnsureRequiredPermissions()
    {
        var requiredPermissions = new[]
        {
            Manifest.Permission.Camera,
            Manifest.Permission.RecordAudio,
            Manifest.Permission.Internet,
        };

        if (Build.VERSION.SdkInt >= BuildVersionCodes.Tiramisu)
        {
            requiredPermissions = requiredPermissions.Append(Manifest.Permission.PostNotifications).ToArray();
        }

        var missingPermissions = requiredPermissions
            .Where(permission => ActivityCompat.CheckSelfPermission(this, permission) != Permission.Granted)
            .ToArray();

        if (missingPermissions.Length > 0)
        {
            ActivityCompat.RequestPermissions(this, missingPermissions, RequiredPermissionsRequestCode);
        }
    }

    [Android.Runtime.Register("onRequestPermissionsResult", ApiSince = 23)]
    public override void OnRequestPermissionsResult(int requestCode, string[] permissions, Permission[] grantResults)
    {
        base.OnRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == RequiredPermissionsRequestCode)
        {
            var hasCamera = grantResults.Length > 0 && permissions.Contains(Manifest.Permission.Camera) && grantResults[Array.IndexOf(permissions, Manifest.Permission.Camera)] == Permission.Granted;
            var hasMic = grantResults.Length > 0 && permissions.Contains(Manifest.Permission.RecordAudio) && grantResults[Array.IndexOf(permissions, Manifest.Permission.RecordAudio)] == Permission.Granted;

            if (!hasCamera || !hasMic)
            {
                // Keep the website flow visible and let the existing browser logic handle denial.
                // No hidden recording or forced grant occurs here.
            }
        }
    }
}



