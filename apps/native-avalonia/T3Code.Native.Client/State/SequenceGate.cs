namespace T3Code.Native.Client.State;

public sealed record SequencedValue<T>(long Sequence, T Value);

public sealed class SequenceGate<T>
{
    private long _lastSequence;

    public long LastSequence => _lastSequence;

    public bool TryApply(SequencedValue<T> next, out T? value)
    {
        if (next.Sequence <= _lastSequence)
        {
            value = default;
            return false;
        }

        _lastSequence = next.Sequence;
        value = next.Value;
        return true;
    }
}
