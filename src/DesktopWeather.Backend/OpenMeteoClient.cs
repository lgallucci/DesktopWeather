using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

internal sealed class OpenMeteoClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _httpClient;
    private readonly TimeProvider _clock;

    public OpenMeteoClient(HttpClient httpClient, TimeProvider? clock = null)
    {
        _httpClient = httpClient;
        _clock = clock ?? TimeProvider.System;
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

    public async Task<WeatherForecast> GetForecastAsync(GeocodedLocation location, string unit)
    {
        var latitude = location.Latitude.ToString(CultureInfo.InvariantCulture);
        var longitude = location.Longitude.ToString(CultureInfo.InvariantCulture);
        var weatherUrl = $"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}"
            + $"&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m"
            + "&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min"
            + "&timezone=auto&timeformat=unixtime&past_days=1&forecast_days=8"
            + $"&temperature_unit={unit}&wind_speed_unit={(unit == "fahrenheit" ? "mph" : "kmh")}";
        var response = await _httpClient.GetFromJsonAsync<ForecastResponse>(weatherUrl, JsonOptions);
        var current = response?.Current
            ?? throw new InvalidDataException("Weather response is missing current conditions.");

        if (current.Temperature is null || current.FeelsLike is null || current.Humidity is null ||
            current.WindSpeed is null || current.WeatherCode is null)
            throw new InvalidDataException("Weather response is missing a required measurement.");

        var conditions = new CurrentConditions(
            current.Temperature.Value,
            current.FeelsLike.Value,
            current.Humidity.Value,
            current.WindSpeed.Value,
            current.WeatherCode.Value);
        var now = _clock.GetUtcNow();
        var timezone = GetTimezone(response!);
        return new WeatherForecast(conditions, SelectHourlyForecast(response!, now, timezone),
            SelectDailyForecast(response!, now, timezone));
    }

    private static TimeZoneInfo GetTimezone(ForecastResponse response)
    {
        if (string.IsNullOrWhiteSpace(response.Timezone))
            throw new InvalidDataException("Weather response is missing its timezone.");
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(response.Timezone);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            throw new InvalidDataException($"Invalid weather timezone '{response.Timezone}'.", ex);
        }
    }

    private static IReadOnlyList<HourlyConditions> SelectHourlyForecast(
        ForecastResponse response, DateTimeOffset now, TimeZoneInfo timezone)
    {
        var hourly = response.Hourly
            ?? throw new InvalidDataException("Weather response is missing hourly forecast.");
        if (hourly.Time is null || hourly.Temperature is null || hourly.WeatherCode is null ||
            hourly.Time.Length != hourly.Temperature.Length || hourly.Time.Length != hourly.WeatherCode.Length)
            throw new InvalidDataException("Hourly forecast is missing required measurements.");
        var currentIndex = Array.FindLastIndex(hourly.Time, time => time <= now.ToUnixTimeSeconds());
        var startIndex = currentIndex - 1;
        if (startIndex < 0 || currentIndex + 4 >= hourly.Time.Length)
            throw new InvalidDataException("Hourly forecast does not cover the requested hours.");

        var result = new List<HourlyConditions>(6);
        for (var index = startIndex; index <= currentIndex + 4; index++)
        {
            if (index > startIndex && hourly.Time[index] - hourly.Time[index - 1] != 3600 ||
                hourly.Temperature[index] is null || hourly.WeatherCode[index] is null)
                throw new InvalidDataException("Hourly forecast is missing required measurements.");

            var time = TimeZoneInfo.ConvertTime(DateTimeOffset.FromUnixTimeSeconds(hourly.Time[index]), timezone);
            result.Add(new HourlyConditions(
                time.ToString("hh:mm", CultureInfo.InvariantCulture),
                hourly.Temperature[index]!.Value,
                hourly.WeatherCode[index]!.Value));
        }
        return result;
    }

    private static IReadOnlyList<DailyConditions> SelectDailyForecast(
        ForecastResponse response, DateTimeOffset now, TimeZoneInfo timezone)
    {
        var daily = response.Daily
            ?? throw new InvalidDataException("Weather response is missing daily forecast.");
        if (daily.Time is null || daily.High is null || daily.Low is null || daily.WeatherCode is null ||
            daily.Time.Length != daily.High.Length || daily.Time.Length != daily.Low.Length ||
            daily.Time.Length != daily.WeatherCode.Length || response.UtcOffsetSeconds is null ||
            Math.Abs((long)response.UtcOffsetSeconds.Value) > 86400)
            throw new InvalidDataException("Daily forecast is missing required measurements.");

        // Open-Meteo's daily Unix timestamps use the response's fixed UTC offset.
        var dates = daily.Time.Select(time => DateOnly.FromDateTime(
            DateTimeOffset.FromUnixTimeSeconds(time).AddSeconds(response.UtcOffsetSeconds.Value).UtcDateTime)).ToArray();
        var tomorrow = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, timezone).DateTime).AddDays(1);
        var startIndex = Array.IndexOf(dates, tomorrow);
        if (startIndex < 0 || startIndex + 5 >= dates.Length)
            throw new InvalidDataException("Daily forecast does not cover the requested days.");

        var result = new List<DailyConditions>(6);
        for (var index = startIndex; index < startIndex + 6; index++)
        {
            if (dates[index] != tomorrow.AddDays(index - startIndex) ||
                daily.High[index] is null || daily.Low[index] is null || daily.WeatherCode[index] is null)
                throw new InvalidDataException("Daily forecast is missing required measurements.");
            result.Add(new DailyConditions(
                dates[index].ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                daily.High[index]!.Value, daily.Low[index]!.Value, daily.WeatherCode[index]!.Value));
        }
        return result;
    }

    private sealed record GeocodingResponse(LocationResponse[]? Results);

    private sealed record LocationResponse(
        string? Name,
        double? Latitude,
        double? Longitude,
        string? Admin1,
        string? Country);

    private sealed record ForecastResponse(
        CurrentWeatherResponse? Current,
        HourlyWeatherResponse? Hourly,
        DailyWeatherResponse? Daily,
        string? Timezone,
        [property: JsonPropertyName("utc_offset_seconds")] int? UtcOffsetSeconds);

    private sealed record HourlyWeatherResponse(
        long[]? Time,
        [property: JsonPropertyName("temperature_2m")] double?[]? Temperature,
        [property: JsonPropertyName("weather_code")] int?[]? WeatherCode);

    private sealed record DailyWeatherResponse(
        long[]? Time,
        [property: JsonPropertyName("temperature_2m_max")] double?[]? High,
        [property: JsonPropertyName("temperature_2m_min")] double?[]? Low,
        [property: JsonPropertyName("weather_code")] int?[]? WeatherCode);

    private sealed record CurrentWeatherResponse(
        [property: JsonPropertyName("temperature_2m")] double? Temperature,
        [property: JsonPropertyName("apparent_temperature")] double? FeelsLike,
        [property: JsonPropertyName("relative_humidity_2m")] int? Humidity,
        [property: JsonPropertyName("wind_speed_10m")] double? WindSpeed,
        [property: JsonPropertyName("weather_code")] int? WeatherCode);
}
