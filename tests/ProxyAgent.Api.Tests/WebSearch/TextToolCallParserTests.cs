using ProxyAgent.Api.WebSearch;

namespace ProxyAgent.Api.Tests.WebSearch;

public sealed class TextToolCallParserTests
{
    [Fact]
    public void Parse_maps_search_variants_and_removes_the_tool_call_block()
    {
        var result = TextToolCallParser.Parse("""
            Mình đang kiểm tra thời tiết.
            <tool_call>
            web_search[{"query":"thời tiết Hà Nội hôm nay","num_results":8}]
            web_search with snippets[{"query":"Hanoi weather today","num_results":5}]
            </tool_call>
            """);

        Assert.Equal("Mình đang kiểm tra thời tiết.", result.AssistantText);
        Assert.Equal(2, result.ToolCalls.Count);
        Assert.All(result.ToolCalls, call => Assert.Equal("web_search", call.Name));
        Assert.Equal("{\"query\":\"thời tiết Hà Nội hôm nay\"}", result.ToolCalls[0].ArgumentsJson);
        Assert.Equal("{\"query\":\"Hanoi weather today\"}", result.ToolCalls[1].ArgumentsJson);
    }

    [Fact]
    public void Parse_maps_json_name_and_arguments_format()
    {
        var result = TextToolCallParser.Parse(
            "<tool_call>{\"name\":\"web_search\",\"arguments\":{\"query\":\"tin mới\"}}</tool_call>");

        var call = Assert.Single(result.ToolCalls);
        Assert.Equal("web_search", call.Name);
        Assert.Equal("{\"query\":\"tin mới\"}", call.ArgumentsJson);
        Assert.Equal(string.Empty, result.AssistantText);
    }

    [Fact]
    public void Parse_maps_function_style_search_calls_and_removes_the_tool_call_block()
    {
        var result = TextToolCallParser.Parse("""
            Mình đang tìm thông tin.
            <tool_call>
            web_search(query=dự báo thời tiết Hà Nội nchmf.gov.vn, num_results=5)
            web_search with snippets(query="nguồn thời tiết Hà Nội", num_results=3)
            </tool_call>
            Kết quả sẽ được tổng hợp ngay.
            """);

        Assert.Equal("Mình đang tìm thông tin.\n\nKết quả sẽ được tổng hợp ngay.", result.AssistantText);
        Assert.Equal(2, result.ToolCalls.Count);
        Assert.Equal("{\"query\":\"dự báo thời tiết Hà Nội nchmf.gov.vn\"}", result.ToolCalls[0].ArgumentsJson);
        Assert.Equal("{\"query\":\"nguồn thời tiết Hà Nội\"}", result.ToolCalls[1].ArgumentsJson);
    }
}
