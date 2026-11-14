internal sealed record WeatherSettings(string City, string Unit);

internal sealed record GeocodedLocation(
    string Name,
    double Latitude,
    double Longitude,
    string? Admin1,
    string? Country);

internal sealed record CurrentConditions(
    double Temperature,
    double FeelsLike,
    int Humidity,
    double WindSpeed,
    int WeatherCode,
    bool IsDay);

internal sealed record HourlyConditions(string Time, double Temperature, int WeatherCode, bool IsDay, double WindSpeed);

internal sealed record DailyConditions(
    string Date, string Sunrise, string Sunset, double High, double Low, int WeatherCode, double WindSpeedMax);

internal sealed record WeatherForecast(
    CurrentConditions Current,
    string Sunrise,
    string Sunset,
    IReadOnlyList<HourlyConditions> Hourly,
    IReadOnlyList<DailyConditions> Daily);

internal sealed record WidgetHourlyForecast(
    string Time, double Temperature, string Conditions, int WeatherCode, bool IsDay, double WindSpeed);

internal sealed record WidgetDailyForecast(
    string Date, string Sunrise, string Sunset, double High, double Low, string Conditions, int WeatherCode,
    double WindSpeedMax);

internal sealed record WidgetWeather(
    string Location,
    double Temperature,
    double FeelsLike,
    int Humidity,
    double WindSpeed,
    string TemperatureUnit,
    string WindUnit,
    bool IsDay,
    string Conditions,
    int WeatherCode,
    string Sunrise,
    string Sunset,
    IReadOnlyList<WidgetHourlyForecast> Hourly,
    IReadOnlyList<WidgetDailyForecast> Daily);
