using System.Text.Json;

using Contracts;

namespace Backend.UnitTests.Contracts;

public sealed class JsonFieldSetTests
{
    [Fact]
    public void FromRecordsPropertyNamesCaseInsensitively()
    {
        var json = JsonDocument.Parse("""{"Name":1,"email":2}""");
        var fields = JsonFieldSet.From(json.RootElement);

        fields.Has("name").Should().BeTrue();
        fields.Has("EMAIL").Should().BeTrue();
        fields.Has("missing").Should().BeFalse();
    }

    [Fact]
    public void AllMatchesEveryFieldName()
    {
        JsonFieldSet.All.Has("anything").Should().BeTrue();
    }
}
