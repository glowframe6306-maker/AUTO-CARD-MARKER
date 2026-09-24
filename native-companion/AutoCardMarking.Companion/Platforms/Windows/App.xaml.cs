using Microsoft.UI.Xaml;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace AutoCardMarking.Companion.WinUI;

/// <summary>
/// Provides application-specific behavior to supplement the default Application class.
/// </summary>
public partial class App : MauiWinUIApplication
{
	public static string? PendingSecurityVerificationSessionId { get; set; }
	/// <summary>
	/// Initializes the singleton application object.  This is the first line of authored code
	/// executed, and as such is the logical equivalent of main() or WinMain().
	/// </summary>
	public App()
	{
		this.InitializeComponent();
	}

	protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();

	protected override void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
	{
		var arguments = args.Arguments ?? string.Empty;
		const string prefix = "securityVerificationSessionId=";
		var index = arguments.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
		if (index >= 0)
		{
			PendingSecurityVerificationSessionId = arguments[(index + prefix.Length)..].Split('&')[0];
		}

		base.OnLaunched(args);
	}
}

