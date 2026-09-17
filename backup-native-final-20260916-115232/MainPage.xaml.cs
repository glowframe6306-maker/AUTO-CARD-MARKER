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
}
