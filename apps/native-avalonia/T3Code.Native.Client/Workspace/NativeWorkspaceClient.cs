using System.Text.Json;
using T3Code.Native.Client.Commands;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Client.Workspace;

public sealed class NativeWorkspaceClient(
    ExistingWsRpcSession session,
    NativeCommandOutbox outbox
)
{
    public async Task<NativeBrowseResult> BrowseAsync(
        string partialPath,
        string? cwd = null,
        CancellationToken cancellationToken = default
    )
    {
        var result = await session
            .RequestAsync<JsonElement>(
                NativeMethods.FilesystemBrowse,
                string.IsNullOrWhiteSpace(cwd) ? new { partialPath } : new { partialPath, cwd },
                cancellationToken: cancellationToken
            )
            .ConfigureAwait(false);

        return NativeWorkspaceMapper.MapBrowseResult(result);
    }

    public async Task<NativeCloneResult> CloneRepositoryAsync(
        string remoteUrl,
        string destinationPath,
        CancellationToken cancellationToken = default
    )
    {
        var result = await session
            .RequestAsync<JsonElement>(
                NativeMethods.SourceControlCloneRepository,
                new { remoteUrl, destinationPath, protocol = "auto" },
                cancellationToken: cancellationToken
            )
            .ConfigureAwait(false);

        return NativeWorkspaceMapper.MapCloneResult(result);
    }

    public async Task<string> CreateProjectAsync(
        string title,
        string workspaceRoot,
        object? defaultModelSelection,
        bool createWorkspaceRootIfMissing = false,
        CancellationToken cancellationToken = default
    )
    {
        var commandId = Guid.NewGuid().ToString("N");
        var projectId = Guid.NewGuid().ToString("N");
        var command = new
        {
            type = "project.create",
            commandId,
            projectId,
            title,
            workspaceRoot,
            createWorkspaceRootIfMissing,
            defaultModelSelection,
            createdAt = DateTimeOffset.UtcNow.ToString("O"),
        };

        await outbox
            .EnqueueAsync(commandId, NativeMethods.OrchestrationDispatchCommand, command, cancellationToken)
            .ConfigureAwait(false);
        await session
            .RequestAsync<JsonElement>(
                NativeMethods.OrchestrationDispatchCommand,
                command,
                id: commandId,
                cancellationToken: cancellationToken
            )
            .ConfigureAwait(false);
        await outbox.CompleteAsync(commandId, cancellationToken).ConfigureAwait(false);

        return projectId;
    }
}

public sealed record NativeBrowseResult(string ParentPath, IReadOnlyList<NativeBrowseEntry> Entries);

public sealed record NativeBrowseEntry(string Name, string FullPath);

public sealed record NativeCloneResult(string Cwd, string RemoteUrl, string? RepositoryName);

public static class NativeWorkspaceMapper
{
    public static NativeBrowseResult MapBrowseResult(JsonElement result)
    {
        var entries = new List<NativeBrowseEntry>();
        if (result.TryGetProperty("entries", out var entryElements) && entryElements.ValueKind == JsonValueKind.Array)
        {
            foreach (var entry in entryElements.EnumerateArray())
            {
                entries.Add(
                    new NativeBrowseEntry(
                        ReadString(entry, "name") ?? "",
                        ReadString(entry, "fullPath") ?? ""
                    )
                );
            }
        }

        return new NativeBrowseResult(ReadString(result, "parentPath") ?? "", entries);
    }

    public static NativeCloneResult MapCloneResult(JsonElement result)
    {
        string? repositoryName = null;
        if (
            result.TryGetProperty("repository", out var repository)
            && repository.ValueKind == JsonValueKind.Object
        )
        {
            repositoryName = ReadString(repository, "nameWithOwner");
        }

        return new NativeCloneResult(
            ReadString(result, "cwd") ?? "",
            ReadString(result, "remoteUrl") ?? "",
            repositoryName
        );
    }

    private static string? ReadString(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property) || property.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.String ? property.GetString() : property.ToString();
    }
}
