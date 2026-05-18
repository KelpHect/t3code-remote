using Android.App;
using Android.Content.PM;
using Avalonia;
using Avalonia.Android;

namespace T3Code.Native.App.Android;

[Activity(
    Label = "T3 Code",
    Theme = "@style/MyTheme.NoActionBar",
    Icon = "@drawable/icon",
    MainLauncher = true,
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.UiMode)]
public class MainActivity : AvaloniaMainActivity
{
}
