using System.Collections.ObjectModel;
using System;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Avalonia.Threading;
using T3Code.Native.Client.Auth;
using T3Code.Native.Client.Commands;
using T3Code.Native.Client.Config;
using T3Code.Native.Client.Diff;
using T3Code.Native.Client.Git;
using T3Code.Native.Client.Terminal;
using T3Code.Native.Client.Discovery;
using T3Code.Native.Client.Shell;
using T3Code.Native.Client.Thread;
using T3Code.Native.Client.Transport;
using T3Code.Native.Client.Workspace;

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

    [ObservableProperty]
    private ProjectShellItem? _selectedProject;

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

    public ObservableCollection<string> GitLogLines { get; } =
    [
        "Select a project and refresh git status.",
    ];

    public ObservableCollection<WorkspaceEntryItem> WorkspaceEntries { get; } = [];

    public ObservableCollection<string> TerminalLines { get; } =
    [
        "Open a terminal for the selected thread.",
    ];

    public ObservableCollection<ModelSelectionItem> Models { get; } =
    [
        new("Codex / GPT-5.5", "codex", "gpt-5.5"),
    ];

    [ObservableProperty]
    private ModelSelectionItem? _selectedModel = new("Codex / GPT-5.5", "codex", "gpt-5.5");

    public ObservableCollection<string> RuntimeModes { get; } =
    [
        "full-access",
        "approval-required",
        "auto-accept-edits",
    ];

    [ObservableProperty]
    private string _selectedRuntimeMode = "full-access";

    public ObservableCollection<string> InteractionModes { get; } =
    [
        "default",
        "plan",
    ];

    [ObservableProperty]
    private string _selectedInteractionMode = "default";

    [ObservableProperty]
    private string _composerText = "";

    [ObservableProperty]
    private string _diffFromTurn = "0";

    [ObservableProperty]
    private string _diffToTurn = "1";

    [ObservableProperty]
    private string _diffText = "";

    [ObservableProperty]
    private string _diffStatus = "Select a thread and load a diff.";

    [ObservableProperty]
    private string _gitStatusText = "Select a project and refresh git status.";

    [ObservableProperty]
    private string _gitCommitMessage = "";

    [ObservableProperty]
    private string _browsePath = "";

    [ObservableProperty]
    private string _workspaceStatus = "Browse desktop files or clone a repository.";

    [ObservableProperty]
    private string _projectTitle = "";

    [ObservableProperty]
    private string _projectWorkspacePath = "";

    [ObservableProperty]
    private string _cloneRemoteUrl = "";

    [ObservableProperty]
    private string _cloneDestinationPath = "";

    [ObservableProperty]
    private string _terminalCwd = "";

    [ObservableProperty]
    private string _terminalInput = "";

    [ObservableProperty]
    private string _terminalStatus = "No terminal open.";

    private readonly NativeAuthClient _authClient = new(new HttpClient());
    private readonly T3BackendDiscoveryClient _discoveryClient = new(new HttpClient());
    private readonly ISecretStore _secretStore = NativeAppServices.SecretStore;
    private readonly NativeCommandOutbox _commandOutbox = new(new MemoryNativeCommandOutboxStore());
    private ExistingWsRpcSession? _shellSession;
    private IAsyncDisposable? _shellSubscription;
    private IAsyncDisposable? _threadSubscription;
    private IAsyncDisposable? _terminalSubscription;
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

    [RelayCommand]
    private async Task LoadTurnDiffAsync()
    {
        if (!TryReadDiffInputs(out var fromTurn, out var toTurn))
        {
            return;
        }

        await LoadDiffAsync(client => client.GetTurnDiffAsync(SelectedThread!.Id, fromTurn, toTurn));
    }

    [RelayCommand]
    private async Task LoadFullThreadDiffAsync()
    {
        if (!TryReadDiffInputs(out _, out var toTurn))
        {
            return;
        }

        await LoadDiffAsync(client => client.GetFullThreadDiffAsync(SelectedThread!.Id, toTurn));
    }

    [RelayCommand]
    private async Task RefreshGitStatusAsync()
    {
        var cwd = SelectedProject?.Detail;
        if (!CanUseProjectCwd(cwd))
        {
            GitStatusText = "Select a project with a workspace path.";
            return;
        }

        if (_shellSession is null)
        {
            GitStatusText = "Pair with a backend first.";
            return;
        }

        try
        {
            GitStatusText = "Refreshing git status...";
            var status = await new NativeGitClient(_shellSession).RefreshStatusAsync(cwd!);
            GitStatusText = status.Summary;
        }
        catch (Exception error)
        {
            GitStatusText = error.Message;
        }
    }

    [RelayCommand]
    private async Task RunGitCommitAsync() => await RunGitActionAsync("commit");

    [RelayCommand]
    private async Task RunGitPushAsync() => await RunGitActionAsync("push");

    [RelayCommand]
    private async Task RunGitCommitPushAsync() => await RunGitActionAsync("commit_push");

    [RelayCommand]
    private async Task RunGitPrPrepAsync() => await RunGitActionAsync("commit_push_pr");

    private async Task RunGitActionAsync(string action)
    {
        var cwd = SelectedProject?.Detail;
        if (!CanUseProjectCwd(cwd))
        {
            GitStatusText = "Select a project with a workspace path.";
            return;
        }

        if (_shellSession is null)
        {
            GitStatusText = "Pair with a backend first.";
            return;
        }

        try
        {
            GitLogLines.Clear();
            GitLogLines.Add($"Starting {action}...");
            var client = new NativeGitClient(_shellSession);
            await client.RunStackedActionAsync(
                cwd!,
                action,
                string.IsNullOrWhiteSpace(GitCommitMessage) ? null : GitCommitMessage.Trim(),
                line =>
                {
                    Dispatcher.UIThread.Post(() => GitLogLines.Add(line.Text));
                    return Task.CompletedTask;
                }
            );
            GitStatusText = $"{action} started. Progress is streaming below.";
        }
        catch (Exception error)
        {
            GitStatusText = error.Message;
            GitLogLines.Add(error.Message);
        }
    }

    [RelayCommand]
    private async Task BrowseWorkspaceAsync()
    {
        if (_shellSession is null)
        {
            WorkspaceStatus = "Pair with a backend first.";
            return;
        }

        try
        {
            WorkspaceStatus = "Browsing...";
            var result = await new NativeWorkspaceClient(_shellSession, _commandOutbox)
                .BrowseAsync(string.IsNullOrWhiteSpace(BrowsePath) ? "." : BrowsePath.Trim());
            WorkspaceEntries.Clear();
            foreach (var entry in result.Entries)
            {
                WorkspaceEntries.Add(new WorkspaceEntryItem(entry.Name, entry.FullPath));
            }

            WorkspaceStatus = $"Loaded {WorkspaceEntries.Count} entries from {result.ParentPath}.";
        }
        catch (Exception error)
        {
            WorkspaceStatus = error.Message;
        }
    }

    [RelayCommand]
    private async Task CreateProjectAsync()
    {
        if (_shellSession is null)
        {
            WorkspaceStatus = "Pair with a backend first.";
            return;
        }

        if (string.IsNullOrWhiteSpace(ProjectTitle) || string.IsNullOrWhiteSpace(ProjectWorkspacePath))
        {
            WorkspaceStatus = "Enter a project title and workspace path.";
            return;
        }

        try
        {
            var projectId = await new NativeWorkspaceClient(_shellSession, _commandOutbox)
                .CreateProjectAsync(
                    ProjectTitle.Trim(),
                    ProjectWorkspacePath.Trim(),
                    BuildSelectedModelSelection()
                );
            WorkspaceStatus = $"Project created: {projectId}";
        }
        catch (Exception error)
        {
            WorkspaceStatus = error.Message;
        }
    }

    [RelayCommand]
    private async Task CloneRepositoryAsync()
    {
        if (_shellSession is null)
        {
            WorkspaceStatus = "Pair with a backend first.";
            return;
        }

        if (string.IsNullOrWhiteSpace(CloneRemoteUrl) || string.IsNullOrWhiteSpace(CloneDestinationPath))
        {
            WorkspaceStatus = "Enter a repository URL and destination path.";
            return;
        }

        try
        {
            WorkspaceStatus = "Cloning repository...";
            var client = new NativeWorkspaceClient(_shellSession, _commandOutbox);
            var clone = await client.CloneRepositoryAsync(CloneRemoteUrl.Trim(), CloneDestinationPath.Trim());
            var title = clone.RepositoryName ?? Path.GetFileName(clone.Cwd.TrimEnd(Path.DirectorySeparatorChar));
            await client.CreateProjectAsync(title, clone.Cwd, BuildSelectedModelSelection());
            ProjectTitle = title;
            ProjectWorkspacePath = clone.Cwd;
            WorkspaceStatus = $"Cloned and added project: {clone.Cwd}";
        }
        catch (Exception error)
        {
            WorkspaceStatus = error.Message;
        }
    }

    [RelayCommand]
    private async Task OpenTerminalAsync()
    {
        if (_shellSession is null || SelectedThread is null)
        {
            TerminalStatus = "Pair and select a thread first.";
            return;
        }

        var cwd = string.IsNullOrWhiteSpace(TerminalCwd)
            ? SelectedProject?.Detail
            : TerminalCwd.Trim();
        if (!CanUseProjectCwd(cwd))
        {
            TerminalStatus = "Enter a terminal cwd or select a project with a workspace path.";
            return;
        }

        try
        {
            var client = new NativeTerminalClient(_shellSession);
            _terminalSubscription ??= await client.SubscribeEventsAsync(eventItem =>
            {
                Dispatcher.UIThread.Post(() => ApplyTerminalEvent(eventItem));
                return Task.CompletedTask;
            });
            var snapshot = await client.OpenAsync(SelectedThread.Id, "default", cwd!);
            TerminalCwd = snapshot.Cwd;
            TerminalLines.Clear();
            AppendTerminalText(snapshot.History);
            TerminalStatus = $"{snapshot.Status} - {snapshot.Cwd}";
        }
        catch (Exception error)
        {
            TerminalStatus = error.Message;
        }
    }

    [RelayCommand]
    private async Task SendTerminalInputAsync()
    {
        if (_shellSession is null || SelectedThread is null || string.IsNullOrEmpty(TerminalInput))
        {
            return;
        }

        try
        {
            var input = TerminalInput.EndsWith('\n') ? TerminalInput : $"{TerminalInput}\n";
            TerminalInput = "";
            await new NativeTerminalClient(_shellSession).WriteAsync(SelectedThread.Id, "default", input);
        }
        catch (Exception error)
        {
            TerminalStatus = error.Message;
        }
    }

    [RelayCommand]
    private async Task ClearTerminalAsync()
    {
        if (_shellSession is null || SelectedThread is null)
        {
            return;
        }

        await new NativeTerminalClient(_shellSession).ClearAsync(SelectedThread.Id, "default");
        TerminalLines.Clear();
    }

    [RelayCommand]
    private async Task RestartTerminalAsync()
    {
        if (_shellSession is null || SelectedThread is null || string.IsNullOrWhiteSpace(TerminalCwd))
        {
            TerminalStatus = "Open a terminal first.";
            return;
        }

        await new NativeTerminalClient(_shellSession).RestartAsync(SelectedThread.Id, "default", TerminalCwd.Trim());
    }

    [RelayCommand]
    private async Task CloseTerminalAsync()
    {
        if (_shellSession is null || SelectedThread is null)
        {
            return;
        }

        await new NativeTerminalClient(_shellSession).CloseAsync(SelectedThread.Id, "default");
        TerminalStatus = "Terminal closed.";
    }

    private async Task LoadDiffAsync(Func<NativeDiffClient, Task<NativeDiffResult>> load)
    {
        if (_shellSession is null || SelectedThread is null)
        {
            DiffStatus = "Select a synced thread first.";
            return;
        }

        try
        {
            DiffStatus = "Loading diff...";
            var result = await load(new NativeDiffClient(_shellSession));
            DiffText = result.State switch
            {
                NativeDiffState.Empty => "",
                NativeDiffState.Binary => result.Diff,
                _ => result.Diff,
            };
            DiffStatus = result.State switch
            {
                NativeDiffState.Empty => "No changes in this range.",
                NativeDiffState.Binary => "Binary diff. Text patch may be unavailable.",
                _ => $"Loaded turn diff {result.FromTurnCount} -> {result.ToTurnCount}.",
            };
        }
        catch (Exception error)
        {
            DiffStatus = error.Message;
        }
    }

    private bool TryReadDiffInputs(out int fromTurn, out int toTurn)
    {
        fromTurn = 0;
        toTurn = 0;
        if (SelectedThread is null)
        {
            DiffStatus = "Select a synced thread first.";
            return false;
        }

        if (!int.TryParse(DiffFromTurn, out fromTurn) || fromTurn < 0)
        {
            DiffStatus = "From turn must be zero or greater.";
            return false;
        }

        if (!int.TryParse(DiffToTurn, out toTurn) || toTurn < 0)
        {
            DiffStatus = "To turn must be zero or greater.";
            return false;
        }

        if (fromTurn > toTurn)
        {
            DiffStatus = "From turn must be less than or equal to to turn.";
            return false;
        }

        return true;
    }

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
        await LoadServerConfigAsync();
        _shellSubscription = await shell.SubscribeShellAsync(update =>
        {
            Dispatcher.UIThread.Post(() => ApplyShellUpdate(update));
            return Task.CompletedTask;
        });
        Status = "Paired. Syncing projects and threads from orchestration.subscribeShell...";
    }

    private async Task LoadServerConfigAsync()
    {
        if (_shellSession is null)
        {
            return;
        }

        var previous = SelectedModel;
        var options = await new NativeServerConfigClient(_shellSession).GetModelOptionsAsync();
        if (options.Count == 0)
        {
            return;
        }

        Models.Clear();
        foreach (var option in options)
        {
            Models.Add(new ModelSelectionItem(option.Label, option.InstanceId, option.Model));
        }

        SelectedModel =
            Models.FirstOrDefault(model =>
                model.InstanceId == previous?.InstanceId && model.Model == previous.Model
            )
            ?? Models.FirstOrDefault();
    }

    private async Task StopShellSubscriptionAsync()
    {
        await StopThreadSubscriptionAsync();
        await StopTerminalSubscriptionAsync();

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

    private async Task StopTerminalSubscriptionAsync()
    {
        if (_terminalSubscription is not null)
        {
            await _terminalSubscription.DisposeAsync();
            _terminalSubscription = null;
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

            SelectedProject = Projects.FirstOrDefault();
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

    private void ApplyTerminalEvent(NativeTerminalEvent eventItem)
    {
        if (SelectedThread is null || eventItem.ThreadId != SelectedThread.Id)
        {
            return;
        }

        if (eventItem.Type == "cleared")
        {
            TerminalLines.Clear();
            TerminalStatus = "Terminal cleared.";
            return;
        }

        if (eventItem.Snapshot is not null)
        {
            TerminalCwd = eventItem.Snapshot.Cwd;
            TerminalStatus = $"{eventItem.Snapshot.Status} - {eventItem.Snapshot.Cwd}";
        }

        AppendTerminalText(eventItem.Text);
    }

    private void AppendTerminalText(string text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return;
        }

        foreach (var line in text.Replace("\r\n", "\n").Split('\n'))
        {
            if (line.Length > 0)
            {
                TerminalLines.Add(line);
            }
        }

        while (TerminalLines.Count > 1000)
        {
            TerminalLines.RemoveAt(0);
        }
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
            instanceId = SelectedModel?.InstanceId ?? "codex",
            model = SelectedModel?.Model ?? "gpt-5.5",
        };

    private static bool CanUseProjectCwd(string? cwd) =>
        !string.IsNullOrWhiteSpace(cwd) && cwd != "No workspace path";

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

public sealed record ModelSelectionItem(string Label, string InstanceId, string Model);

public sealed record WorkspaceEntryItem(string Name, string FullPath);

public sealed record ChatLineItem(
    string Speaker,
    string Text,
    string Background = "#1b1f27",
    string BorderBrush = "#2a2f3a",
    string SpeakerForeground = "#aab2c0"
);
