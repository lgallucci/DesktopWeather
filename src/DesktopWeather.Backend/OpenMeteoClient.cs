using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

internal sealed class OpenMeteoClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;

    public OpenMeteoClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<GeocodedLocation> FindLocationAsync(string city)
    {
        var geocodingUrl = "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name="
            + Uri.EscapeDataString(city.Trim());
        var response = await _httpClient.GetFromJsonAsync<GeocodingResponse>(geocodingUrl, JsonOptions);
        var location = response?.Results?.FirstOrDefault()
            ?? throw new InvalidDataException($"No location found for '{city}'.");

        if (string.IsNullOrWhiteSpace(location.Name) || location.Latitude is null || location.Longitude is null)
            throw new InvalidDataException("Geocoding response is missing location data.");

        return new GeocodedLocation(
            location.Name,
            location.Latitude.Value,
            location.Longitude.Value,
            location.Admin1,
            location.Country);
    }

    public async Task<CurrentConditions> GetCurrentConditionsAsync(GeocodedLocation location, string unit)
    {
        var latitude = location.Latitude.ToString(CultureInfo.InvariantCulture);
        var longitude = location.Longitude.ToString(CultureInfo.InvariantCulture);
        var weatherUrl = $"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}"
            + $"&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
            + $"&temperature_unit={unit}&wind_speed_unit={(unit == "fahrenheit" ? "mph" : "kmh")}";
        var response = await _httpClient.GetFromJsonAsync<ForecastResponse>(weatherUrl, JsonOptions);
        var current = response?.Current
            ?? throw new InvalidDataException("Weather response is missing current conditions.");

        if (current.Temperature is null || current.FeelsLike is null || current.Humidity is null ||
            current.WindSpeed is null || current.WeatherCode is null)
            throw new InvalidDataException("Weather response is missing a required measurement.");

        return new CurrentConditions(
            current.Temperature.Value,
            current.FeelsLike.Value,
            current.Humidity.Value,
            current.WindSpeed.Value,
            current.WeatherCode.Value);
    }

    private sealed record GeocodingResponse(LocationResponse[]? Results);

    private sealed record LocationResponse(
        string? Name,
        double? Latitude,
        double? Longitude,
        string? Admin1,
        string? Country);

    private sealed record ForecastResponse(CurrentWeatherResponse? Current);

    private sealed record CurrentWeatherResponse(
        [property: JsonPropertyName("temperature_2m")] double? Temperature,
        [property: JsonPropertyName("apparent_temperature")] double? FeelsLike,
        [property: JsonPropertyName("relative_humidity_2m")] int? Humidity,
        [property: JsonPropertyName("wind_speed_10m")] double? WindSpeed,
        [property: JsonPropertyName("weather_code")] int? WeatherCode);
}
