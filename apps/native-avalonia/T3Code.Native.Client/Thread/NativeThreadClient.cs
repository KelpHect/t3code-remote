using System.Text.Json;
using T3Code.Native.Client.Protocol;
using T3Code.Native.Client.State;
using T3Code.Native.Client.Transport;

namespace T3Code.Native.Client.Thread;

public sealed class NativeThreadClient(ExistingWsRpcSession session)
{
    public async Task<IAsyncDisposable> SubscribeThreadAsync(
        string threadId,
        Func<NativeThreadUpdate, Task> onUpdate,
        CancellationToken cancellationToken = default
    ) =>
        await session.SubscribeAsync<JsonElement>(
            NativeMethods.OrchestrationSubscribeThread,
            new { threadId },
            element => onUpdate(NativeThreadMapper.MapThreadUpdate(element)),
            cancellationToken: cancellationToken
        ).ConfigureAwait(false);
}

public sealed class NativeThreadState
{
    private readonly SequenceGate<NativeThreadUpdate> _sequenceGate = new();
    private readonly Dictionary<string, NativeThreadEntry> _entries = [];

    public string ThreadId { get; private set; } = "";

    public string Title { get; private set; } = "No thread selected";

    public string SessionStatus { get; private set; } = "";

    public long Sequence => _sequenceGate.LastSequence;

    public IReadOnlyList<NativeThreadEntry> Entries =>
        _entries.Values.OrderBy(entry => entry.CreatedAt).ThenBy(entry => entry.Id).ToArray();

    public bool Apply(NativeThreadUpdate update)
    {
        var sequence = update.Sequence ?? update.Snapshot?.Sequence ?? 0;
        if (!_sequenceGate.TryApply(new SequencedValue<NativeThreadUpdate>(sequence, update), out var accepted))
        {
            return false;
        }

        update = accepted!;

        if (update.Snapshot is not null)
        {
            ThreadId = update.Snapshot.ThreadId;
            Title = update.Snapshot.Title;
            SessionStatus = update.Snapshot.SessionStatus ?? "";
            _entries.Clear();
            foreach (var entry in update.Snapshot.Entries)
            {
                _entries[entry.Id] = entry;
            }

            return true;
        }

        if (update.Entry is not null)
        {
            _entries[update.Entry.Id] = update.Entry;
            return true;
        }

        if (update.SessionStatus is not null)
        {
            SessionStatus = update.SessionStatus;
            return true;
        }

        return false;
    }
}

public sealed record NativeThreadUpdate(
    NativeThreadSnapshot? Snapshot = null,
    NativeThreadEntry? Entry = null,
    string? SessionStatus = null,
    long? Sequence = null
);

public sealed record NativeThreadSnapshot(
    long Sequence,
    string ThreadId,
    string Title,
    string? SessionStatus,
    IReadOnlyList<NativeThreadEntry> Entries
);

public sealed record NativeThreadEntry(
    string Id,
    NativeThreadEntryKind Kind,
    string Speaker,
    string Text,
    string Tone,
    bool Streaming,
    DateTimeOffset CreatedAt
);

public enum NativeThreadEntryKind
{
    Message,
    Activity,
}

public static class NativeThreadMapper
{
    public static NativeThreadUpdate MapThreadUpdate(JsonElement element)
    {
        var kind = ReadString(element, "kind") ?? "";
        return kind switch
        {
            "snapshot" => new NativeThreadUpdate(Snapshot: MapSnapshot(element.GetProperty("snapshot"))),
            "event" => MapEvent(element.GetProperty("event")),
            _ => new NativeThreadUpdate(Sequence: ReadOptionalInt64(element, "sequence")),
        };
    }

    private static NativeThreadSnapshot MapSnapshot(JsonElement snapshot)
    {
        var sequence = ReadOptionalInt64(snapshot, "snapshotSequence") ?? 0;
        var thread = snapshot.GetProperty("thread");
        var entries = new List<NativeThreadEntry>();

        if (thread.TryGetProperty("messages", out var messages))
        {
            foreach (var message in messages.EnumerateArray())
            {
                entries.Add(MapMessage(message));
            }
        }

        if (thread.TryGetProperty("activities", out var activities))
        {
            foreach (var activity in activities.EnumerateArray())
            {
                entries.Add(MapActivity(activity));
            }
        }

        var sessionStatus = thread.TryGetProperty("session", out var session)
            && session.ValueKind == JsonValueKind.Object
            ? ReadString(session, "status")
            : null;

        return new NativeThreadSnapshot(
            sequence,
            ReadString(thread, "id") ?? "",
            ReadString(thread, "title") ?? "Untitled thread",
            sessionStatus,
            entries
        );
    }

    private static NativeThreadUpdate MapEvent(JsonElement eventElement)
    {
        var type = ReadString(eventElement, "type") ?? "";
        var sequence = ReadOptionalInt64(eventElement, "sequence");
        if (!eventElement.TryGetProperty("payload", out var payload))
        {
            return new NativeThreadUpdate(Sequence: sequence);
        }

        return type switch
        {
            "thread.message-sent" => new NativeThreadUpdate(
                Entry: MapMessage(payload),
                Sequence: sequence
            ),
            "thread.activity-appended" => new NativeThreadUpdate(
                Entry: MapActivity(payload.GetProperty("activity")),
                Sequence: sequence
            ),
            "thread.session-set" => new NativeThreadUpdate(
                SessionStatus: payload.TryGetProperty("session", out var session)
                    ? ReadString(session, "status")
                    : null,
                Sequence: sequence
            ),
            _ => new NativeThreadUpdate(Sequence: sequence),
        };
    }

    private static NativeThreadEntry MapMessage(JsonElement message)
    {
        var role = ReadString(message, "role") ?? "system";
        return new NativeThreadEntry(
            ReadString(message, "id") ?? ReadString(message, "messageId") ?? Guid.NewGuid().ToString("N"),
            NativeThreadEntryKind.Message,
            role,
            ReadString(message, "text") ?? "",
            role,
            ReadBool(message, "streaming") ?? false,
            ReadDate(message, "createdAt")
        );
    }

    private static NativeThreadEntry MapActivity(JsonElement activity)
    {
        var tone = ReadString(activity, "tone") ?? "info";
        var kind = ReadString(activity, "kind") ?? "activity";
        var summary = ReadString(activity, "summary") ?? kind;
        var displayTone = tone == "approval" || kind.Contains("user-input", StringComparison.OrdinalIgnoreCase)
            ? "action"
            : tone;

        return new NativeThreadEntry(
            ReadString(activity, "id") ?? Guid.NewGuid().ToString("N"),
            NativeThreadEntryKind.Activity,
            kind,
            summary,
            displayTone,
            false,
            ReadDate(activity, "createdAt")
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

    private static bool? ReadBool(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.True
            ? true
            : property.ValueKind == JsonValueKind.False
                ? false
                : null;
    }

    private static long? ReadOptionalInt64(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return null;
        }

        return property.ValueKind == JsonValueKind.Number && property.TryGetInt64(out var value)
            ? value
            : null;
    }

    private static DateTimeOffset ReadDate(JsonElement element, string propertyName)
    {
        var value = ReadString(element, propertyName);
        return DateTimeOffset.TryParse(value, out var parsed) ? parsed : DateTimeOffset.MinValue;
    }
}
