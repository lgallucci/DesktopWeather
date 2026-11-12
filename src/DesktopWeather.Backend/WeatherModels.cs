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

internal sealed record WidgetWeather(
    string Location,
    double Temperature,
    double FeelsLike,
    int Humidity,
    double WindSpeed,
    string TemperatureUnit,
    string WindUnit,
    string Conditions);
