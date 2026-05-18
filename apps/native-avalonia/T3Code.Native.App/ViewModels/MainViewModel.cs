using System.Collections.ObjectModel;
using System;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Avalonia.Threading;
using T3Code.Native.Client.Auth;
using T3Code.Native.Client.Commands;
using T3Code.Native.Client.Discovery;
using T3Code.Native.Client.Shell;
using T3Code.Native.Client.Thread;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.App.ViewModels;

public partial class MainViewModel : ViewModelBase
{
    [ObservableProperty]
    private string _baseUrl = "";

    [ObservableProperty]
    private string _pairingToken = "";

    [ObservableProperty]
    private string _status = "VPN/private network only. Pair with a desktop backend you trust.";

    [ObservableProperty]
    private string _serverName = "Not connected";

    [ObservableProperty]
    private string _protocol = "Existing backend /ws compatibility";

    [ObservableProperty]
    private bool _isPaired;

    [ObservableProperty]
    private bool _isScanning;

    [ObservableProperty]
    private DiscoveredBackendItem? _selectedBackend;

    [ObservableProperty]
    private ThreadShellItem? _selectedThread;

    public ObservableCollection<DiscoveredBackendItem> DiscoveredBackends { get; } = [];

    public ObservableCollection<ProjectShellItem> Projects { get; } =
    [
        new("placeholder-project", "Local backend", "Pair to load projects from orchestration.subscribeShell"),
    ];

    public ObservableCollection<ThreadShellItem> Threads { get; } =
    [
        new("placeholder-thread", "No thread selected", "Existing and new chats will appear here after shell sync."),
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
        "full-access",
        "approval-required",
        "auto-accept-edits",
    ];

    [ObservableProperty]
    private string _selectedRuntimeMode = "default";

    public ObservableCollection<string> InteractionModes { get; } =
    [
        "default",
        "plan",
    ];

    [ObservableProperty]
    private string _selectedInteractionMode = "default";

    [ObservableProperty]
    private string _composerText = "";

    private readonly NativeAuthClient _authClient = new(new HttpClient());
    private readonly T3BackendDiscoveryClient _discoveryClient = new(new HttpClient());
    private readonly ISecretStore _secretStore = NativeAppServices.SecretStore;
    private readonly NativeCommandOutbox _commandOutbox = new(new MemoryNativeCommandOutboxStore());
    private ExistingWsRpcSession? _shellSession;
    private IAsyncDisposable? _shellSubscription;
    private IAsyncDisposable? _threadSubscription;
    private NativeThreadState _threadState = new();

    [RelayCommand]
    private async Task ScanBackendsAsync()
    {
        if (IsScanning)
        {
            return;
        }

        try
        {
            IsScanning = true;
            Status = "Scanning private network for T3 backends...";
            var discovered = await _discoveryClient.DiscoverAsync();
            DiscoveredBackends.Clear();

            foreach (var backend in discovered)
            {
                DiscoveredBackends.Add(
                    new DiscoveredBackendItem(
                        backend.BaseUri.ToString().TrimEnd('/'),
                        backend.Source,
                        backend.Authenticated ? "Already authenticated" : "Pairing required"
                    )
                );
            }

            SelectedBackend = DiscoveredBackends.FirstOrDefault();
            Status = DiscoveredBackends.Count == 0
                ? "No T3 backend found. Enter a VPN/LAN URL manually."
                : $"Found {DiscoveredBackends.Count} T3 backend candidate(s).";
        }
        catch (Exception error)
        {
            Status = error.Message;
        }
        finally
        {
            IsScanning = false;
        }
    }

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
            await _secretStore.SaveBearerTokenAsync(baseUri, auth.SessionToken);
            IsPaired = true;
            ServerName = baseUri.Authority;
            Protocol = "Existing /ws with short-lived ws-token refresh";
            Status = baseUri.Scheme == Uri.UriSchemeHttp
                ? "Paired over cleartext HTTP. Use only through VPN/private LAN."
                : "Paired.";
            await StartShellSubscriptionAsync(baseUri);
        }
        catch (Exception error)
        {
            Status = error.Message;
        }
    }

    [RelayCommand]
    private async Task QueueComposer()
    {
        if (string.IsNullOrWhiteSpace(ComposerText))
        {
            return;
        }

        ChatLines.Add(new("you", ComposerText.Trim()));
        var text = ComposerText.Trim();
        ComposerText = "";
        await DispatchThreadCommandAsync(client =>
            client.SendTurnAsync(
                SelectedThread!.Id,
                text,
                BuildSelectedModelSelection(),
                SelectedRuntimeMode,
                SelectedInteractionMode
            )
        );
    }

    [RelayCommand]
    private async Task ContinueThreadAsync() =>
        await DispatchThreadCommandAsync(client =>
            client.ContinueAsync(
                SelectedThread!.Id,
                BuildSelectedModelSelection(),
                SelectedRuntimeMode,
                SelectedInteractionMode
            )
        );

    [RelayCommand]
    private async Task StopThreadAsync() =>
        await DispatchThreadCommandAsync(client => client.InterruptTurnAsync(SelectedThread!.Id));

    private async Task DispatchThreadCommandAsync(
        Func<NativeThreadCommandClient, Task<string>> dispatch
    )
    {
        if (_shellSession is null || SelectedThread is null)
        {
            Status = "Select a synced thread first.";
            return;
        }

        try
        {
            var client = new NativeThreadCommandClient(_shellSession, _commandOutbox);
            var commandId = await dispatch(client);
            Status = $"Command queued: {commandId}";
        }
        catch (Exception error)
        {
            Status = error.Message;
        }
    }

    private async Task LoadThreadAsync(ThreadShellItem thread)
    {
        if (_shellSession is null)
        {
            return;
        }

        try
        {
            await StopThreadSubscriptionAsync();
            _threadState = new NativeThreadState();
            ChatLines.Clear();
            ChatLines.Add(new("system", $"Loading {thread.Title}...", "#15171c", "#2a2f3a", "#8c95a4"));

            var client = new NativeThreadClient(_shellSession);
            _threadSubscription = await client.SubscribeThreadAsync(thread.Id, update =>
            {
                Dispatcher.UIThread.Post(() => ApplyThreadUpdate(update));
                return Task.CompletedTask;
            });
            Status = $"Loading thread {thread.Title}.";
        }
        catch (Exception error)
        {
            Status = error.Message;
        }
    }

    private async Task StartShellSubscriptionAsync(Uri baseUri)
    {
        await StopShellSubscriptionAsync();

        _shellSession = new ExistingWsRpcSession(new ClientWebSocketFactory());
        var refreshingSession = new RefreshingExistingWsRpcSession(
            _shellSession,
            new BearerTokenExistingWsUriProvider(_authClient, _secretStore, baseUri)
        );
        await refreshingSession.ConnectAsync();
        var shell = new NativeShellClient(_shellSession);
        _shellSubscription = await shell.SubscribeShellAsync(update =>
        {
            Dispatcher.UIThread.Post(() => ApplyShellUpdate(update));
            return Task.CompletedTask;
        });
        Status = "Paired. Syncing projects and threads from orchestration.subscribeShell...";
    }

    private async Task StopShellSubscriptionAsync()
    {
        await StopThreadSubscriptionAsync();

        if (_shellSubscription is not null)
        {
            await _shellSubscription.DisposeAsync();
            _shellSubscription = null;
        }

        if (_shellSession is not null)
        {
            await _shellSession.DisposeAsync();
            _shellSession = null;
        }
    }

    private async Task StopThreadSubscriptionAsync()
    {
        if (_threadSubscription is not null)
        {
            await _threadSubscription.DisposeAsync();
            _threadSubscription = null;
        }
    }

    private void ApplyShellUpdate(NativeShellUpdate update)
    {
        if (update.Snapshot is not null)
        {
            Projects.Clear();
            foreach (var project in update.Snapshot.Projects)
            {
                Projects.Add(ToProjectItem(project));
            }

            Threads.Clear();
            foreach (var thread in update.Snapshot.Threads)
            {
                Threads.Add(ToThreadItem(thread));
            }

            SelectedThread = Threads.FirstOrDefault();
            Status = $"Synced {Projects.Count} project(s) and {Threads.Count} thread(s).";
            return;
        }

        if (update.Project is not null)
        {
            ReplaceProject(update.Project);
        }

        if (update.RemovedProjectId is not null)
        {
            RemoveProject(update.RemovedProjectId);
        }

        if (update.Thread is not null)
        {
            ReplaceThread(update.Thread);
        }

        if (update.RemovedThreadId is not null)
        {
            RemoveThread(update.RemovedThreadId);
        }
    }

    private void ReplaceProject(NativeProjectShell project)
    {
        RemoveProject(project.Id);
        Projects.Add(ToProjectItem(project));
    }

    private void RemoveProject(string projectId)
    {
        var existing = Projects.FirstOrDefault(project => project.Id == projectId);
        if (existing is not null)
        {
            Projects.Remove(existing);
        }
    }

    private void ReplaceThread(NativeThreadShell thread)
    {
        RemoveThread(thread.Id);
        Threads.Add(ToThreadItem(thread));
    }

    private void RemoveThread(string threadId)
    {
        var existing = Threads.FirstOrDefault(thread => thread.Id == threadId);
        if (existing is not null)
        {
            Threads.Remove(existing);
        }
    }

    private static ProjectShellItem ToProjectItem(NativeProjectShell project) =>
        new(project.Id, project.Title, project.WorkspaceRoot ?? "No workspace path");

    private static ThreadShellItem ToThreadItem(NativeThreadShell thread) =>
        new(thread.Id, thread.Title, thread.Detail);

    private void ApplyThreadUpdate(NativeThreadUpdate update)
    {
        if (!_threadState.Apply(update))
        {
            return;
        }

        ChatLines.Clear();
        foreach (var entry in _threadState.Entries)
        {
            ChatLines.Add(ToChatLine(entry));
        }

        if (ChatLines.Count == 0)
        {
            ChatLines.Add(new("system", "No messages in this thread yet.", "#15171c", "#2a2f3a", "#8c95a4"));
        }

        Status = string.IsNullOrWhiteSpace(_threadState.SessionStatus)
            ? $"Loaded {_threadState.Title}."
            : $"{_threadState.Title} - {_threadState.SessionStatus}.";
    }

    private static ChatLineItem ToChatLine(NativeThreadEntry entry) =>
        entry.Tone switch
        {
            "user" => new ChatLineItem(entry.Speaker, entry.Text, "#102039", "#2563eb", "#93c5fd"),
            "assistant" => new ChatLineItem(entry.Speaker, entry.Text, "#16191f", "#2a2f3a", "#aab2c0"),
            "action" => new ChatLineItem(entry.Speaker, entry.Text, "#1f2638", "#3b82f6", "#93c5fd"),
            "error" => new ChatLineItem(entry.Speaker, entry.Text, "#2a1618", "#ef4444", "#fca5a5"),
            "tool" => new ChatLineItem(entry.Speaker, entry.Text, "#171b22", "#475569", "#cbd5e1"),
            _ => new ChatLineItem(entry.Speaker, entry.Text),
        };

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

    private object BuildSelectedModelSelection() =>
        new
        {
            instanceId = "codex",
            model = SelectedModel,
        };

    partial void OnSelectedBackendChanged(DiscoveredBackendItem? value)
    {
        if (value is not null)
        {
            BaseUrl = value.BaseUrl;
        }
    }

    partial void OnSelectedThreadChanged(ThreadShellItem? value)
    {
        if (value is not null)
        {
            _ = LoadThreadAsync(value);
        }
    }
}

public sealed record DiscoveredBackendItem(string BaseUrl, string Source, string Status);

public sealed record ProjectShellItem(string Id, string Title, string Detail);

public sealed record ThreadShellItem(string Id, string Title, string Detail);

public sealed record ChatLineItem(
    string Speaker,
    string Text,
    string Background = "#1b1f27",
    string BorderBrush = "#2a2f3a",
    string SpeakerForeground = "#aab2c0"
);
