using System.Net.Http.Json;
using System.Runtime.InteropServices;
#if ANDROID
using Android.Provider;
using Android.Webkit;
using Android.OS;
using Java.Interop;
using Firebase.Messaging;
#endif

using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Maui.ApplicationModel;
#if WINDOWS
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;
#endif

namespace AutoCardMarking.Companion;

public partial class MainPage : ContentPage
{
#if WINDOWS
    private static readonly string WindowsAuthFile =
    Path.Combine(
        System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData),
        "AUTO CARD MARKING",
        "auth.dat"
    );
    private static readonly byte[] WindowsAuthEntropy =
        System.Text.Encoding.UTF8.GetBytes("AUTO-CARD-MARKING-WINDOWS-AUTH-V2");
    private bool _windowsWebViewInitialized;
    private Timer? _windowsVerificationTimer;
    private readonly HashSet<int> _windowsSeenVerificationSessions = new();

    [StructLayout(LayoutKind.Sequential)]
    private struct DATA_BLOB { public int cbData; public IntPtr pbData; }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptProtectData(ref DATA_BLOB input, string? description, ref DATA_BLOB entropy, IntPtr reserved, IntPtr prompt, int flags, out DATA_BLOB output);

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptUnprotectData(ref DATA_BLOB input, IntPtr description, ref DATA_BLOB entropy, IntPtr reserved, IntPtr prompt, int flags, out DATA_BLOB output);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    private static byte[] ProtectWindowsToken(byte[] bytes)
    {
        var inputHandle = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        var entropyHandle = GCHandle.Alloc(WindowsAuthEntropy, GCHandleType.Pinned);
        try
        {
            var input = new DATA_BLOB { cbData = bytes.Length, pbData = inputHandle.AddrOfPinnedObject() };
            var entropy = new DATA_BLOB { cbData = WindowsAuthEntropy.Length, pbData = entropyHandle.AddrOfPinnedObject() };
            if (!CryptProtectData(ref input, "AUTO CARD MARKING", ref entropy, IntPtr.Zero, IntPtr.Zero, 0x1, out var output))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            try { var result = new byte[output.cbData]; Marshal.Copy(output.pbData, result, 0, output.cbData); return result; }
            finally { LocalFree(output.pbData); }
        }
        finally { inputHandle.Free(); entropyHandle.Free(); }
    }

    private static byte[] UnprotectWindowsToken(byte[] bytes)
    {
        var inputHandle = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        var entropyHandle = GCHandle.Alloc(WindowsAuthEntropy, GCHandleType.Pinned);
        try
        {
            var input = new DATA_BLOB { cbData = bytes.Length, pbData = inputHandle.AddrOfPinnedObject() };
            var entropy = new DATA_BLOB { cbData = WindowsAuthEntropy.Length, pbData = entropyHandle.AddrOfPinnedObject() };
            if (!CryptUnprotectData(ref input, IntPtr.Zero, ref entropy, IntPtr.Zero, IntPtr.Zero, 0x1, out var output))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            try { var result = new byte[output.cbData]; Marshal.Copy(output.pbData, result, 0, output.cbData); return result; }
            finally { LocalFree(output.pbData); }
        }
        finally { inputHandle.Free(); entropyHandle.Free(); }
    }

    private static void SaveWindowsAuthToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return;
        }

        var directory = Path.GetDirectoryName(WindowsAuthFile);

        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var protectedBytes =
            ProtectWindowsToken(
                System.Text.Encoding.UTF8.GetBytes(token)
            );

        var temporaryFile = WindowsAuthFile + ".tmp";

        File.WriteAllBytes(temporaryFile, protectedBytes);

        if (File.Exists(WindowsAuthFile))
        {
            File.Replace(
                temporaryFile,
                WindowsAuthFile,
                null
            );
        }
        else
        {
            File.Move(
                temporaryFile,
                WindowsAuthFile
            );
        }
    }

    private static string? LoadWindowsAuthToken()
    {
        try
        {
            if (!File.Exists(WindowsAuthFile)) return null;
            var bytes = File.ReadAllBytes(WindowsAuthFile);
            if (bytes.Length == 0) return null;
            var token = System.Text.Encoding.UTF8.GetString(UnprotectWindowsToken(bytes));
            return string.IsNullOrWhiteSpace(token) ? null : token;
        }
        catch { return null; }
    }

    private static void DeleteWindowsAuthToken()
    {
        try { if (File.Exists(WindowsAuthFile)) File.Delete(WindowsAuthFile); }
        catch { }
    }

    private async Task<(bool Valid, bool Delete, bool IsOwner)> ValidateWindowsTokenAsync(string token)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{ApiBaseUrl}/api/auth/me");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await AppHttpClient.SendAsync(request);
            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
                return (false, true, false);
            if (!response.IsSuccessStatusCode) return (false, false, ReadOwnerClaim(token));
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var isOwner = document.RootElement.TryGetProperty("isOwner", out var owner) && owner.GetBoolean();
            return (true, false, isOwner);
        }
        catch { return (false, false, ReadOwnerClaim(token)); }
    }

    private static bool ReadOwnerClaim(string token)
    {
        try
        {
            var parts = token.Split('.');
            if (parts.Length < 2) return false;
            var payload = parts[1].Replace('-', '+').Replace('_', '/');
            payload = payload.PadRight(payload.Length + ((4 - payload.Length % 4) % 4), '=');
            using var document = JsonDocument.Parse(Convert.FromBase64String(payload));
            return document.RootElement.TryGetProperty("isOwner", out var owner) && owner.GetBoolean();
        }
        catch { return false; }
    }

    private static string WindowsAuthDocumentScript(string? token)
    {
        var serializedToken = JsonSerializer.Serialize(token ?? "");
        return @"(() => {
            const native = window.chrome && window.chrome.webview;
            const send = (message) => { try { native?.postMessage(JSON.stringify(message)); } catch {} };
            const storage = window.localStorage;
            const originalSetItem = storage.setItem.bind(storage);
            const originalRemoveItem = storage.removeItem.bind(storage);
            storage.setItem = (key, value) => { originalSetItem(key, value); if (key === 'authToken') send({ type: 'AUTO_CARD_AUTH_TOKEN_SET', token: value }); };
            storage.removeItem = (key) => { originalRemoveItem(key); if (key === 'authToken') send({ type: 'AUTO_CARD_AUTH_TOKEN_CLEAR' }); };
            const token = __TOKEN__;
            if (token) originalSetItem('authToken', token);
        })();".Replace("__TOKEN__", serializedToken);
    }

    private async void HandleWindowsWebMessage(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs args)
    {
        try
        {
            var raw = args.WebMessageAsJson;

            if (string.IsNullOrWhiteSpace(raw))
            {
                return;
            }

            string? message = null;

            try
            {
                message = JsonSerializer.Deserialize<string>(raw);
            }
            catch
            {
                // Some WebView2 callers can provide a JSON object directly.
                message = raw;
            }

            if (string.IsNullOrWhiteSpace(message))
            {
                return;
            }

            using var document = JsonDocument.Parse(message);

            if (!document.RootElement.TryGetProperty("type", out var typeElement))
            {
                return;
            }

            var type = typeElement.GetString();

            if (type == "AUTO_CARD_AUTH_TOKEN_CLEAR" || type == "clearAuthToken")
            {
                DeleteWindowsAuthToken();
                return;
            }

            if (type == "AUTO_CARD_AUTH_TOKEN_SET" || type == "authToken")
            {
                if (!document.RootElement.TryGetProperty("token", out var tokenElement))
                {
                    return;
                }

                var token = tokenElement.GetString();

                if (!string.IsNullOrWhiteSpace(token))
                {
                    SaveWindowsAuthToken(token);
                }
            }
        }
        catch
        {
            // Authentication data is never written to logs or diagnostics.
        }
    }

    private async Task InitializeWindowsWebViewAsync()
    {
        if (_windowsWebViewInitialized)
        {
            return;
        }

        if (WebsiteWebView.Handler?.PlatformView is not Microsoft.UI.Xaml.Controls.WebView2 webView)
        {
            return;
        }

        await webView.EnsureCoreWebView2Async();

        var core = webView.CoreWebView2;

        core.WebMessageReceived -= HandleWindowsWebMessage;
        core.WebMessageReceived += HandleWindowsWebMessage;

        // Native DPAPI token is the Windows persistence source of truth.
        var token = LoadWindowsAuthToken();

        var validation = (Valid: false, Delete: false, IsOwner: false);

        if (!string.IsNullOrWhiteSpace(token))
        {
            validation = await ValidateWindowsTokenAsync(token);

            // Only authentication failures remove the persistent token.
            // Network/server failures preserve it.
            if (validation.Delete)
            {
                DeleteWindowsAuthToken();
                token = null;
            }
        }

        // Install the document-created script BEFORE navigation.
        // This ensures localStorage.authToken is restored before the
        // Next.js application evaluates its authentication state.
        await core.AddScriptToExecuteOnDocumentCreatedAsync(
            WindowsAuthDocumentScript(token)
        );

        _windowsWebViewInitialized = true;

        string route;

        if (string.IsNullOrWhiteSpace(token))
        {
            route = "/";
        }
        else if (validation.IsOwner)
        {
            route = "/dashboard";
        }
        else
        {
            route = "/member-dashboard";
        }

        core.Navigate($"{WebsiteUrl}{route}");
    }
#endif
    private static readonly HttpClient AppHttpClient = new();
    private bool _deviceRegistrationInProgress;
#if ANDROID
    private bool _nativeRequestOpened;
#endif

#if ANDROID
    private const string WebsiteUrl = "http://10.0.2.2:3000";
    private const string ApiBaseUrl = "http://10.0.2.2:8000";
#elif WINDOWS
    private const string WebsiteUrl = "http://localhost:3000";
    private const string ApiBaseUrl = "http://localhost:8000";
#endif


    public MainPage()
    {
        var windowsWebViewProfile =
            Path.Combine(
                System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData),
                "AUTO CARD MARKING",
                "WebView2"
            );

        Directory.CreateDirectory(windowsWebViewProfile);

        System.Environment.SetEnvironmentVariable(
            "WEBVIEW2_USER_DATA_FOLDER",
            windowsWebViewProfile
        );

        InitializeComponent();

#if !WINDOWS
        WebsiteWebView.Source = WebsiteUrl;
#endif
    }

protected override void OnAppearing()
    {
        base.OnAppearing();

#if ANDROID
        OpenNativeVerificationRequestIfNeeded();
#endif
        _ = RegisterThisDeviceAsync();
    #if WINDOWS
        StartWindowsVerificationMonitor();
    #endif
    }

#if ANDROID
    public void HandleNativeSecurityVerificationSession(string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return;
        }

        MainThread.BeginInvokeOnMainThread(() =>
        {
            try
            {
                _nativeRequestOpened = true;

                WebsiteWebView.Source =
                    $"{WebsiteUrl}/?securityVerificationSessionId={Uri.EscapeDataString(sessionId)}";
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine(
                    $"Security Verification session navigation failed: {ex.Message}"
                );
            }
        });
    }
    private void OpenNativeVerificationRequestIfNeeded()
    {
        if (_nativeRequestOpened)
        {
            return;
        }

        var sessionId = Platform.CurrentActivity?.Intent?.GetStringExtra("securityVerificationSessionId");
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            return;
        }

        _nativeRequestOpened = true;
        WebsiteWebView.Source = $"{WebsiteUrl}/?securityVerificationSessionId={Uri.EscapeDataString(sessionId)}";
    }
#else
#endif

    private async Task RegisterThisDeviceAsync()
    {
        if (_deviceRegistrationInProgress)
        {
            return;
        }

        _deviceRegistrationInProgress = true;

#if ANDROID
        try
        {
            var token = await TryReadAuthenticatedTokenAsync();
            if (string.IsNullOrWhiteSpace(token))
            {
                return;
            }

        var androidId = Settings.Secure.GetString(Android.App.Application.Context.ContentResolver, Android.Provider.Settings.Secure.AndroidId)
            ?? Guid.NewGuid().ToString("N");
        var deviceId = $"android:{androidId}";
        var deviceIdentifier = TryReadDeviceIdentifier(token);
        if (string.IsNullOrWhiteSpace(deviceIdentifier))
        {
            return;
        }

        string? pushToken = Preferences.Default.Get("securityVerificationPushToken", string.Empty);

        try
        {
            var tokenSource = new TaskCompletionSource<string?>(
                TaskCreationOptions.RunContinuationsAsynchronously
            );

            FirebaseMessaging.Instance
                .GetToken()
                .AddOnCompleteListener(
                    new FirebaseTokenCompleteListener(tokenSource)
                );

            pushToken = await tokenSource.Task;

            if (!string.IsNullOrWhiteSpace(pushToken))
            {
                Preferences.Default.Set(
                    "securityVerificationPushToken",
                    pushToken
                );
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"FCM token unavailable: {ex.Message}");
        }

        var payload = new
        {
            deviceId,
            deviceIdentifier,
            platform = "ANDROID",
            deviceName = $"{Build.Manufacturer} {Build.Model}".Trim(),
            pushToken,
        };

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{ApiBaseUrl}/api/verification/device/register");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Content = JsonContent.Create(payload);

            using var response = await AppHttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Device registration failed: {(int)response.StatusCode} {response.ReasonPhrase}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Device registration error: {ex.Message}");
        }
        finally
        {
            _deviceRegistrationInProgress = false;
        }
#elif WINDOWS
        try
        {
            var token = LoadWindowsAuthToken();
            if (string.IsNullOrWhiteSpace(token)) return;

            var payload = new
            {
                deviceId = $"windows:{Environment.MachineName}",
                platform = "WINDOWS",
                deviceName = Environment.MachineName,
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{ApiBaseUrl}/api/verification/device/register");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Content = JsonContent.Create(payload);
            using var response = await AppHttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
                System.Diagnostics.Debug.WriteLine($"Windows device registration failed: {(int)response.StatusCode}");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Windows device registration error: {ex.Message}");
        }
        finally
        {
            _deviceRegistrationInProgress = false;
        }
#endif
    }

#if ANDROID
    private async Task<string?> TryReadAuthenticatedTokenAsync()
    {
        if (Handler?.PlatformView is not Android.Webkit.WebView platformWebView)
        {
            return null;
        }

        var completion = new TaskCompletionSource<string?>();
        platformWebView.EvaluateJavascript(
            "(() => { try { return localStorage.getItem('authToken') || ''; } catch (error) { return ''; } })();",
            new JavascriptValueCallback(result => completion.TrySetResult(result)));

        return await completion.Task;
    }

    private static string? TryReadDeviceIdentifier(string token)
    {
        try
        {
            var tokenParts = token.Split('.');
            if (tokenParts.Length < 2)
            {
                return null;
            }

            var payload = tokenParts[1].Replace('-', '+').Replace('_', '/');
            payload = payload.PadRight(payload.Length + ((4 - payload.Length % 4) % 4), '=');
            using var document = JsonDocument.Parse(Convert.FromBase64String(payload));
            return document.RootElement.TryGetProperty("deviceIdentifier", out var deviceIdentifier)
                ? deviceIdentifier.GetString()
                : null;
        }
        catch
        {
            return null;
        }
    }

    private sealed class JavascriptValueCallback : Java.Lang.Object, IValueCallback
    {
        private readonly Action<string?> _callback;

        public JavascriptValueCallback(Action<string?> callback)
        {
            _callback = callback;
        }

        public void OnReceiveValue(Java.Lang.Object? value)
        {
            var encodedValue = value?.ToString();
            if (string.IsNullOrWhiteSpace(encodedValue))
            {
                _callback(null);
                return;
            }

            try
            {
                _callback(JsonSerializer.Deserialize<string>(encodedValue));
            }
            catch
            {
                _callback(null);
            }
        }
    }
#endif


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

#if WINDOWS

    private void StartWindowsVerificationMonitor()
    {
        if (_windowsVerificationTimer != null) return;
        _windowsVerificationTimer = new Timer(
            async _ => await PollWindowsVerificationRequestsAsync(),
            null,
            TimeSpan.Zero,
            TimeSpan.FromSeconds(15));
    }

    private async Task PollWindowsVerificationRequestsAsync()
    {
        try
        {
            await RegisterThisDeviceAsync();
            var token = LoadWindowsAuthToken();
            if (string.IsNullOrWhiteSpace(token)) return;

            using var request = new HttpRequestMessage(HttpMethod.Get, $"{ApiBaseUrl}/api/notifications");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await AppHttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode) return;

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            if (document.RootElement.ValueKind != JsonValueKind.Array) return;

            foreach (var notification in document.RootElement.EnumerateArray())
            {
                if (!notification.TryGetProperty("type", out var type) || type.GetString() != "SECURITY_VERIFICATION_REQUESTED") continue;
                if (!notification.TryGetProperty("metadata", out var metadata) || !metadata.TryGetProperty("sessionId", out var sessionValue)) continue;
                var sessionId = sessionValue.GetInt32();
                if (!_windowsSeenVerificationSessions.Add(sessionId)) continue;
                ShowWindowsVerificationToast(sessionId);
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Windows verification monitor error: {ex.Message}");
        }
    }

    private void ShowWindowsVerificationToast(int sessionId)
    {
        try
        {
            var xml = ToastNotificationManager.GetTemplateContent(ToastTemplateType.ToastText02);
            var textNodes = xml.GetElementsByTagName("text");
            textNodes[0].AppendChild(xml.CreateTextNode("Security Verification Request"));
            textNodes[1].AppendChild(xml.CreateTextNode("Open AUTO CARD MARKING to approve or deny the request."));
            xml.DocumentElement?.SetAttribute("launch", $"securityVerificationSessionId={sessionId}");
            ToastNotificationManager.CreateToastNotifier().Show(new ToastNotification(xml));
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Windows toast notification failed: {ex.Message}");
        }
    }
#endif

#if ANDROID
    private sealed class FirebaseTokenCompleteListener :
        Java.Lang.Object,
        Android.Gms.Tasks.IOnCompleteListener
    {
        private readonly TaskCompletionSource<string?> _source;

        public FirebaseTokenCompleteListener(
            TaskCompletionSource<string?> source)
        {
            _source = source;
        }

        public void OnComplete(Android.Gms.Tasks.Task task)
        {
            try
            {
                if (task.IsSuccessful && task.Result != null)
                {
                    _source.TrySetResult(task.Result.ToString());
                }
                else
                {
                    _source.TrySetResult(null);
                }
            }
            catch (Exception ex)
            {
                _source.TrySetException(ex);
            }
        }
    }
#endif
}





