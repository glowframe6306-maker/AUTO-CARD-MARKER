#if ANDROID
using Android.App;
using Android.Content;
using Android.OS;
using AndroidX.Core.App;
using Firebase.Messaging;

namespace AutoCardMarking.Companion;

[Service(Exported = true, Name = "com.companyname.autocardmarking.companion.SecurityVerificationFirebaseMessagingService")]
[IntentFilter(new[] { "com.google.firebase.MESSAGING_EVENT" })]
public sealed class SecurityVerificationFirebaseMessagingService : FirebaseMessagingService
{
    private const string ChannelId = "security-verification";
    private const int NotificationId = 4201;

    public override void OnNewToken(string token)
    {
        if (!string.IsNullOrWhiteSpace(token))
        {
            Preferences.Default.Set("securityVerificationPushToken", token);
        }
    }

    public override void OnMessageReceived(RemoteMessage message)
    {
        var data = message.Data;
        if (data is null || !data.TryGetValue("kind", out var kind) || kind != "SECURITY_VERIFICATION_REQUEST")
        {
            return;
        }

        var sessionId = data.TryGetValue("sessionId", out var value) ? value : string.Empty;
        var launchIntent = PackageManager?.GetLaunchIntentForPackage(PackageName);
        if (launchIntent is null)
        {
            return;
        }

        launchIntent.AddFlags(ActivityFlags.ClearTop | ActivityFlags.SingleTop);
        launchIntent.PutExtra("securityVerificationSessionId", sessionId);
launchIntent.PutExtra("securityVerificationNotification", true);

        var pendingIntent = PendingIntent.GetActivity(
            this,
            NotificationId,
            launchIntent,
            PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable);

        if (Build.VERSION.SdkInt >= BuildVersionCodes.O)
        {
            var notificationManager = (NotificationManager?)GetSystemService(NotificationService);
            notificationManager?.CreateNotificationChannel(new NotificationChannel(
                ChannelId,
                "Security Verification",
                NotificationImportance.High));
        }

        var notification = new NotificationCompat.Builder(this, ChannelId)
            .SetSmallIcon(Resource.Mipmap.appicon)
            .SetContentTitle("Security Verification Request")
            .SetContentText("Open the app to review the recording request.")
            .SetPriority((int)NotificationPriority.High)
            .SetAutoCancel(true)
            .SetContentIntent(pendingIntent)
            .Build();

        NotificationManagerCompat.From(this).Notify(NotificationId, notification);
    }
}
#endif
