# Android Security Verification Push Setup

The Android companion now contains the FCM client and notification service, but push is not live until the real Firebase project configuration is supplied.

Required external configuration:

1. Create or select the real Firebase project used by this deployment.
2. Register the Android application with package ID `com.companyname.autocardmarking.companion`.
3. Download the Firebase-generated `google-services.json` and place it at `native-companion/AutoCardMarking.Companion/google-services.json`. The project consumes it through the conditional `GoogleServicesJson` build item. Do not commit it if the deployment policy treats it as private configuration.
4. Configure the backend with a real FCM credential using `FCM_SERVER_KEY` or `FIREBASE_SERVER_KEY`, without placing the value in source control or logs.
5. Build and install the APK on a real Android device, grant notifications when prompted, and verify that the device registration contains a live push token.

The app registers only the authenticated JWT device identifier, a stable installation identifier, platform/device name, and the FCM token. It does not send passwords. Camera and microphone access remains controlled by Android and the existing recording flow.

Until a real Firebase configuration is installed and a real-device notification test succeeds, closed-app Android push must be treated as **NOT LIVE**.