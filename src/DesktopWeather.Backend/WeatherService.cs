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
        var forecast = await _openMeteoClient.GetForecastAsync(location, settings.Unit);
        var current = forecast.Current;
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
            current.IsDay,
            WeatherCodeDescription.Describe(current.WeatherCode),
            current.WeatherCode,
            forecast.Sunrise,
            forecast.Sunset,
            forecast.Hourly.Select(hour => new WidgetHourlyForecast(
                hour.Time, hour.Temperature, WeatherCodeDescription.Describe(hour.WeatherCode),
                hour.WeatherCode, hour.IsDay, hour.WindSpeed)).ToArray(),
            forecast.Daily.Select(day => new WidgetDailyForecast(
                day.Date, day.Sunrise, day.Sunset, day.High, day.Low,
                WeatherCodeDescription.Describe(day.WeatherCode), day.WeatherCode, day.WindSpeedMax)).ToArray());
    }
}
