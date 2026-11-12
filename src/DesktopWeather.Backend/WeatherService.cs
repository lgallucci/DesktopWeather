internal sealed class WeatherService
{
    private readonly OpenMeteoClient _openMeteoClient;

    public WeatherService(OpenMeteoClient openMeteoClient)
    {
        _openMeteoClient = openMeteoClient;
    }

    public async Task<WidgetWeather> GetCurrentWeatherAsync(WeatherSettings settings)
    {
        var location = await _openMeteoClient.FindLocationAsync(settings.City);
        var current = await _openMeteoClient.GetCurrentConditionsAsync(location, settings.Unit);
        var place = string.Join(", ", new[] { location.Name, location.Admin1, location.Country }
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase));

        return new WidgetWeather(
            place,
            current.Temperature,
            current.FeelsLike,
            current.Humidity,
            current.WindSpeed,
            settings.Unit == "fahrenheit" ? "F" : "C",
            settings.Unit == "fahrenheit" ? "mph" : "km/h",
            WeatherCodeDescription.Describe(current.WeatherCode));
    }
}
