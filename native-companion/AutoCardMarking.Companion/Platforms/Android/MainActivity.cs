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
    }

    private void EnsureRequiredPermissions()
    {
        var requiredPermissions = new[]
        {
            Manifest.Permission.Camera,
            Manifest.Permission.RecordAudio,
            Manifest.Permission.Internet,
        };

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
