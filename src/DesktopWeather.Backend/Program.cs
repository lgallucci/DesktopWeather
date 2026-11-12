using System.Text.Json;

var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);

try
{
    var settings = await new WeatherSettingsStore().LoadAsync();
    using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
    var weatherService = new WeatherService(new OpenMeteoClient(httpClient));
    var weather = await weatherService.GetCurrentWeatherAsync(settings);

    Console.WriteLine(JsonSerializer.Serialize(weather, jsonOptions));
    return 0;
}
catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException or
                           UnauthorizedAccessException or JsonException or InvalidDataException)
{
    Console.Error.WriteLine($"Desktop Weather: {ex.Message}");
    return 1;
}
