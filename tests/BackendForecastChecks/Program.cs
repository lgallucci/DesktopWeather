using System.Net;
using System.Text;
using System.Text.Json;

await CheckForecastAsync(
    "Asia/Kolkata",
    new DateTimeOffset(2026, 1, 1, 18, 45, 0, TimeSpan.Zero),
    new DateTimeOffset(2026, 1, 1, 17, 30, 0, TimeSpan.Zero),
    ["11:00", "12:00", "01:00", "02:00", "03:00", "04:00"]);
await CheckForecastAsync(
    "America/Chicago",
    new DateTimeOffset(2026, 11, 1, 7, 30, 0, TimeSpan.Zero),
    new DateTimeOffset(2026, 11, 1, 6, 0, 0, TimeSpan.Zero),
    ["01:00", "01:00", "02:00", "03:00", "04:00", "05:00"]);
await CheckIncompleteForecastAsync();
await CheckIncompleteDailyForecastAsync();
await CheckIncompleteWindAsync();
CheckForecastDescriptions();
Console.WriteLine("Forecast checks passed");

static async Task CheckForecastAsync(
    string timezone, DateTimeOffset now, DateTimeOffset firstHour, string[] expectedTimes)
{
    var handler = new ForecastHandler(CreateResponse(timezone, firstHour));
    using var http = new HttpClient(handler);
    var service = new WeatherService(new OpenMeteoClient(http, new FixedClock(now)));
    var result = await service.GetCurrentWeatherAsync(new WeatherSettings(" Test City ", "fahrenheit"));
    Assert(result.Location == "Test City, Country", "Location formatting changed");
    Assert(result.TemperatureUnit == "F" && result.WindUnit == "mph", "Units changed");
    Assert(result.IsDay, "Current day/night status was not mapped");
    Assert(result.WeatherCode == 61 && result.Conditions == "Slight rain",
        "Current weather description was not mapped");
    Assert(result.Hourly.Count == 6, "Forecast must contain exactly six hours");
    Assert(result.Hourly.Select(hour => hour.Time).SequenceEqual(expectedTimes), "Incorrect local hour window");
    Assert(result.Hourly.Select(hour => hour.Temperature).SequenceEqual(new double[] {10, 11, 12, 13, 14, 15}),
        "Hourly temperatures do not match selected hours");
    Assert(result.Hourly.Select(hour => hour.IsDay).SequenceEqual(new[] {true, false, false, false, false, false}),
        "Hourly day/night status was not mapped");
    Assert(result.Hourly.Select(hour => hour.WeatherCode).SequenceEqual(new[] {0, 61, 1, 0, 0, 0}),
        "Hourly weather codes were not mapped");
    Assert(result.Hourly.Select(hour => hour.WindSpeed).SequenceEqual(new double[] {10, 20, 25, 26, 30, 40}),
        "Hourly wind speeds were not mapped");
    Assert(result.Hourly[0].Conditions == "Clear sky" && result.Hourly[1].Conditions == "Slight rain",
        "Hourly conditions were not mapped");
    var localToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(
        now, TimeZoneInfo.FindSystemTimeZoneById(timezone)).DateTime);
    Assert(result.Daily.Count == 6, "Daily forecast must contain six future days");
    Assert(result.Daily.Select(day => day.Date).SequenceEqual(
        Enumerable.Range(1, 6).Select(i => localToday.AddDays(i).ToString("yyyy-MM-dd"))),
        "Incorrect daily forecast dates");
    Assert(result.Daily[0].High == 22 && result.Daily[0].Low == 2 &&
        result.Daily[0].Conditions == "Slight rain", "Daily forecast values were not mapped");
    Assert(result.Daily.Select(day => day.WindSpeedMax).SequenceEqual(new double[] {22, 23, 24, 25, 26, 27}),
        "Daily maximum wind speeds were not mapped");
    Assert(WeatherCodeDescription.Describe(19) == "Funnel cloud (tornado or waterspout)",
        "Code 19 description was not mapped");
    Assert(handler.ForecastUri is not null &&
        handler.ForecastUri.Query.Contains(
            "current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day") &&
        handler.ForecastUri.Query.Contains("hourly=temperature_2m,weather_code,is_day,wind_speed_10m") &&
        handler.ForecastUri.Query.Contains(
            "daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max") &&
        handler.ForecastUri.Query.Contains("forecast_days=8") &&
        handler.ForecastUri.Query.Contains("timezone=auto") &&
        handler.ForecastUri.Query.Contains("timeformat=unixtime") &&
        handler.ForecastUri.Query.Contains("temperature_unit=fahrenheit") &&
        handler.ForecastUri.Query.Contains("wind_speed_unit=mph"), "Forecast request parameters are incorrect");
}

static void CheckForecastDescriptions()
{
    var expected = new Dictionary<int, string>
    {
        [0] = "Clear sky", [1] = "Mainly clear", [2] = "Partly cloudy", [3] = "Overcast",
        [45] = "Fog", [48] = "Depositing rime fog",
        [51] = "Light drizzle", [53] = "Moderate drizzle", [55] = "Dense drizzle",
        [56] = "Light freezing drizzle", [57] = "Dense freezing drizzle",
        [61] = "Slight rain", [63] = "Moderate rain", [65] = "Heavy rain",
        [66] = "Light freezing rain", [67] = "Heavy freezing rain",
        [71] = "Slight snowfall", [73] = "Moderate snowfall", [75] = "Heavy snowfall",
        [77] = "Snow grains", [80] = "Slight rain showers", [81] = "Moderate rain showers",
        [82] = "Violent rain showers", [85] = "Slight snow showers", [86] = "Heavy snow showers",
        [95] = "Thunderstorm", [96] = "Thunderstorm with slight hail", [97] = "Heavy thunderstorm",
        [99] = "Thunderstorm with heavy hail",
    };
    foreach (var (code, description) in expected)
        Assert(WeatherCodeDescription.Describe(code) == description, $"Incorrect weather description for {code}");
    Assert(WeatherCodeDescription.Describe(19) == "Funnel cloud (tornado or waterspout)" &&
        WeatherCodeDescription.Describe(999) == "Unknown conditions (code 999)",
        "Weather descriptions must retain the existing fallback");
}

static async Task CheckIncompleteWindAsync()
{
    var now = new DateTimeOffset(2026, 1, 1, 12, 30, 0, TimeSpan.Zero);
    foreach (var daily in new[] {false, true})
    {
        using var http = new HttpClient(new ForecastHandler(CreateResponse(
            "UTC", now.AddMinutes(-90), incompleteHourlyWind: !daily, incompleteDailyWind: daily)));
        var client = new OpenMeteoClient(http, new FixedClock(now));
        try
        {
            await client.GetForecastAsync(new GeocodedLocation("Test", 0, 0, null, null), "celsius");
            throw new Exception("Incomplete wind data was accepted");
        }
        catch (InvalidDataException ex) when (ex.Message.Contains(daily ? "Daily forecast" : "Hourly forecast"))
        {
        }
    }
}

static async Task CheckIncompleteForecastAsync()
{
    var now = new DateTimeOffset(2026, 1, 1, 12, 30, 0, TimeSpan.Zero);
    using var http = new HttpClient(new ForecastHandler(CreateResponse("UTC", now.AddMinutes(-90), incomplete: true)));
    var client = new OpenMeteoClient(http, new FixedClock(now));
    try
    {
        await client.GetForecastAsync(new GeocodedLocation("Test", 0, 0, null, null), "celsius");
        throw new Exception("Incomplete hourly data was accepted");
    }
    catch (InvalidDataException ex) when (ex.Message.Contains("Hourly forecast"))
    {
    }
}

static async Task CheckIncompleteDailyForecastAsync()
{
    var now = new DateTimeOffset(2026, 1, 1, 12, 30, 0, TimeSpan.Zero);
    using var http = new HttpClient(new ForecastHandler(
        CreateResponse("UTC", now.AddMinutes(-90), incompleteDaily: true)));
    var client = new OpenMeteoClient(http, new FixedClock(now));
    try
    {
        await client.GetForecastAsync(new GeocodedLocation("Test", 0, 0, null, null), "celsius");
        throw new Exception("Incomplete daily data was accepted");
    }
    catch (InvalidDataException ex) when (ex.Message.Contains("Daily forecast"))
    {
    }
}

static string CreateResponse(
    string timezone, DateTimeOffset firstHour, bool incomplete = false, bool incompleteDaily = false,
    bool incompleteHourlyWind = false, bool incompleteDailyWind = false)
{
    var times = Enumerable.Range(0, 6).Select(i => firstHour.AddHours(i).ToUnixTimeSeconds()).ToArray();
    var zone = TimeZoneInfo.FindSystemTimeZoneById(timezone);
    var reference = firstHour.AddHours(1);
    var offset = zone.GetUtcOffset(reference);
    var today = TimeZoneInfo.ConvertTime(reference, zone).Date;
    var firstDay = new DateTimeOffset(today.AddDays(-1), offset);
    return JsonSerializer.Serialize(new
    {
        timezone,
        utc_offset_seconds = (int)offset.TotalSeconds,
        current = new
        {
            temperature_2m = 10,
            apparent_temperature = 9,
            relative_humidity_2m = 50,
            wind_speed_10m = 5,
            weather_code = 61,
            is_day = 1,
        },
        hourly = new
        {
            time = times,
            temperature_2m = incomplete ? new double?[] {10, 11, null, 13, 14, 15} :
                new double?[] {10, 11, 12, 13, 14, 15},
            weather_code = new[] {0, 61, 1, 0, 0, 0},
            is_day = new[] {1, 0, 0, 0, 0, 0},
            wind_speed_10m = incompleteHourlyWind
                ? new double?[] {10, 20, null, 26, 30, 40}
                : new double?[] {10, 20, 25, 26, 30, 40},
        },
        daily = new
        {
            time = Enumerable.Range(0, 8).Select(i => firstDay.AddDays(i).ToUnixTimeSeconds()).ToArray(),
            temperature_2m_max = incompleteDaily
                ? new double?[] {20, 21, null, 23, 24, 25, 26, 27}
                : new double?[] {20, 21, 22, 23, 24, 25, 26, 27},
            temperature_2m_min = Enumerable.Range(0, 8).ToArray(),
            weather_code = new[] {0, 0, 61, 0, 0, 0, 0, 0},
            wind_speed_10m_max = incompleteDailyWind
                ? new double?[] {20, 21, null, 23, 24, 25, 26, 27}
                : new double?[] {20, 21, 22, 23, 24, 25, 26, 27},
        },
    });
}

static void Assert(bool condition, string message)
{
    if (!condition)
        throw new Exception(message);
}

sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}

sealed class ForecastHandler(string response) : HttpMessageHandler
{
    public Uri? ForecastUri { get; private set; }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var uri = request.RequestUri ?? throw new Exception("Missing request URI");
        var body = uri.Host == "geocoding-api.open-meteo.com"
            ? """{"results":[{"name":"Test City","latitude":1,"longitude":2,"country":"Country"}]}"""
            : response;
        if (uri.Host == "api.open-meteo.com")
            ForecastUri = uri;
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        });
    }
}
