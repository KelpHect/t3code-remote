using System.Collections.ObjectModel;
using System;
using System.Net.Http;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using T3Code.Native.Client.Auth;

namespace T3Code.Native.App.ViewModels;

public partial class MainViewModel : ViewModelBase
{
    [ObservableProperty]
    private string _baseUrl = "http://127.0.0.1:3773";

    [ObservableProperty]
    private string _pairingToken = "";

    [ObservableProperty]
    private string _status = "VPN/private network only. Pair with a desktop backend you trust.";

    [ObservableProperty]
    private string _serverName = "Not connected";

    [ObservableProperty]
    private string _protocol = "Native protocol pending";

    [ObservableProperty]
    private bool _isPaired;

    public ObservableCollection<ProjectShellItem> Projects { get; } =
    [
        new("Local backend", "Pair to load projects from orchestration.subscribeShell"),
    ];

    public ObservableCollection<ThreadShellItem> Threads { get; } =
    [
        new("No thread selected", "Existing and new chats will appear here after shell sync."),
    ];

    public ObservableCollection<ChatLineItem> ChatLines { get; } =
    [
        new("system", "The desktop backend remains the source of truth for projects, threads, diffs, git, and terminals."),
    ];

    public ObservableCollection<string> Models { get; } =
    [
        "gpt-5.5",
        "gpt-5.4",
        "claude-sonnet-4.5",
    ];

    [ObservableProperty]
    private string _selectedModel = "gpt-5.5";

    public ObservableCollection<string> RuntimeModes { get; } =
    [
        "default",
        "plan",
        "auto",
    ];

    [ObservableProperty]
    private string _selectedRuntimeMode = "default";

    public ObservableCollection<string> InteractionModes { get; } =
    [
        "default",
        "review",
        "unattended",
    ];

    [ObservableProperty]
    private string _selectedInteractionMode = "default";

    [ObservableProperty]
    private string _composerText = "";

    private readonly NativeAuthClient _authClient = new(new HttpClient());
    private readonly ISecretStore _secretStore = new MemorySecretStore();

    [RelayCommand]
    private async Task PairAsync()
    {
        if (!Uri.TryCreate(BaseUrl.Trim(), UriKind.Absolute, out var baseUri))
        {
            Status = "Enter a valid backend URL.";
            return;
        }

        if (string.IsNullOrWhiteSpace(PairingToken))
        {
            Status = "Enter a pairing token or pairing URL.";
            return;
        }

        try
        {
            Status = "Pairing...";
            var credential = ExtractPairingCredential(PairingToken);
            var auth = await _authClient.ExchangePairingTokenAsync(baseUri, credential);
            await _secretStore.SaveBearerTokenAsync(baseUri, auth.BearerToken);
            var wsToken = await _authClient.IssueWebSocketTokenAsync(baseUri, auth.BearerToken);
            IsPaired = true;
            ServerName = baseUri.Authority;
            Protocol = NativeAuthClient.BuildNativeWebSocketUri(baseUri, wsToken.WsToken).ToString();
            Status = "Paired. Waiting for /native/ws support in the desktop backend.";

            try
            {
                var descriptor = await _authClient.GetDescriptorAsync(baseUri);
                ServerName = descriptor.ServerName;
                Protocol = $"v{descriptor.ProtocolVersion} ({descriptor.AuthMode})";
                Status = descriptor.CleartextHttp
                    ? "Paired over cleartext HTTP. Use only through VPN/private LAN."
                    : "Paired.";
            }
            catch
            {
                // Current backend builds may not expose the future native descriptor yet.
            }
        }
        catch (Exception error)
        {
            Status = error.Message;
        }
    }

    [RelayCommand]
    private void QueueComposer()
    {
        if (string.IsNullOrWhiteSpace(ComposerText))
        {
            return;
        }

        ChatLines.Add(new("you", ComposerText.Trim()));
        ComposerText = "";
        Status = "Queued locally until orchestration.dispatchCommand is available on /native/ws.";
    }

    private static string ExtractPairingCredential(string input)
    {
        var trimmed = input.Trim();
        if (Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            var hash = uri.Fragment.TrimStart('#');
            foreach (var part in hash.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var pieces = part.Split('=', 2);
                if (pieces.Length == 2 && pieces[0] == "token")
                {
                    return Uri.UnescapeDataString(pieces[1]);
                }
            }
        }

        return trimmed;
    }
}

public sealed record ProjectShellItem(string Title, string Detail);

public sealed record ThreadShellItem(string Title, string Detail);

public sealed record ChatLineItem(string Speaker, string Text);
