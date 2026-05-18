using T3Code.Native.Client.State;

namespace T3Code.Native.Tests;

public sealed class SequenceGateTests
{
    [Fact]
    public void AppliesOnlyIncreasingSequences()
    {
        var gate = new SequenceGate<string>();

        Assert.True(gate.TryApply(new SequencedValue<string>(2, "snapshot"), out var first));
        Assert.Equal("snapshot", first);

        Assert.False(gate.TryApply(new SequencedValue<string>(1, "stale"), out var stale));
        Assert.Null(stale);

        Assert.False(gate.TryApply(new SequencedValue<string>(2, "duplicate"), out var duplicate));
        Assert.Null(duplicate);

        Assert.True(gate.TryApply(new SequencedValue<string>(3, "live"), out var next));
        Assert.Equal("live", next);
        Assert.Equal(3, gate.LastSequence);
    }
}
