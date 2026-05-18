using System.Text.Json;
using T3Code.Native.Client.Commands;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Client.Thread;

public sealed class NativeThreadCommandClient(
    ExistingWsRpcSession session,
    NativeCommandOutbox outbox
)
{
    public async Task<string> SendTurnAsync(
        string threadId,
        string text,
        object? modelSelection,
        string runtimeMode,
        string interactionMode,
        CancellationToken cancellationToken = default
    )
    {
        var commandId = NewCommandId();
        var createdAt = DateTimeOffset.UtcNow.ToString("O");
        var command = new
        {
            type = "thread.turn.start",
            commandId,
            threadId,
            message = new
            {
                messageId = NewCommandId(),
                role = "user",
                text,
                attachments = Array.Empty<object>(),
            },
            modelSelection,
            titleSeed = text.Length > 80 ? text[..80] : text,
            runtimeMode,
            interactionMode,
            createdAt,
        };

        await DispatchWithOutboxAsync(commandId, command, cancellationToken).ConfigureAwait(false);
        return commandId;
    }

    public Task<string> ContinueAsync(
        string threadId,
        object? modelSelection,
        string runtimeMode,
        string interactionMode,
        CancellationToken cancellationToken = default
    ) =>
        SendTurnAsync(
            threadId,
            "Continue.",
            modelSelection,
            runtimeMode,
            interactionMode,
            cancellationToken
        );

    public async Task<string> InterruptTurnAsync(
        string threadId,
        CancellationToken cancellationToken = default
    )
    {
        var commandId = NewCommandId();
        await DispatchWithOutboxAsync(
                commandId,
                new
                {
                    type = "thread.turn.interrupt",
                    commandId,
                    threadId,
                    createdAt = DateTimeOffset.UtcNow.ToString("O"),
                },
                cancellationToken
            )
            .ConfigureAwait(false);
        return commandId;
    }

    public async Task<string> StopSessionAsync(
        string threadId,
        CancellationToken cancellationToken = default
    )
    {
        var commandId = NewCommandId();
        await DispatchWithOutboxAsync(
                commandId,
                new
                {
                    type = "thread.session.stop",
                    commandId,
                    threadId,
                    createdAt = DateTimeOffset.UtcNow.ToString("O"),
                },
                cancellationToken
            )
            .ConfigureAwait(false);
        return commandId;
    }

    private async Task DispatchWithOutboxAsync(
        string commandId,
        object command,
        CancellationToken cancellationToken
    )
    {
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
    }

    private static string NewCommandId() => Guid.NewGuid().ToString("N");
}
