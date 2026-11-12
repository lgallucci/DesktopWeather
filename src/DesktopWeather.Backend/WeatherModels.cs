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
    int WeatherCode);

internal sealed record HourlyConditions(string Time, double Temperature, int WeatherCode);

internal sealed record DailyConditions(string Date, double High, double Low, int WeatherCode);

internal sealed record WeatherForecast(
    CurrentConditions Current,
    IReadOnlyList<HourlyConditions> Hourly,
    IReadOnlyList<DailyConditions> Daily);

internal sealed record WidgetHourlyForecast(string Time, double Temperature, string Conditions);

internal sealed record WidgetDailyForecast(string Date, double High, double Low, string Conditions);

internal sealed record WidgetWeather(
    string Location,
    double Temperature,
    double FeelsLike,
    int Humidity,
    double WindSpeed,
    string TemperatureUnit,
    string WindUnit,
    string Conditions,
    IReadOnlyList<WidgetHourlyForecast> Hourly,
    IReadOnlyList<WidgetDailyForecast> Daily);
