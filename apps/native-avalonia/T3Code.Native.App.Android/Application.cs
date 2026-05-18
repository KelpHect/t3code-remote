using Android.App;
using Android.Runtime;
using Avalonia;
using Avalonia.Android;
using T3Code.Native.App.Android.Security;

namespace T3Code.Native.App.Android
{
    [Application]
    public class Application : AvaloniaAndroidApplication<App>
    {
        protected Application(nint javaReference, JniHandleOwnership transfer) : base(javaReference, transfer)
        {
        }

        protected override AppBuilder CustomizeAppBuilder(AppBuilder builder)
        {
            NativeAppServices.SecretStore = new AndroidSecretStore(this);
            return base.CustomizeAppBuilder(builder)
            .WithInterFont();
        }
    }
}
