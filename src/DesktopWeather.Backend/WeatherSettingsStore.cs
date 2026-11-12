using System.Text.Json;

internal sealed class WeatherSettingsStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<WeatherSettings> LoadAsync()
    {
        var configPath = GetConfigPath();
        var settings = File.Exists(configPath)
            ? JsonSerializer.Deserialize<SettingsFile>(await File.ReadAllTextAsync(configPath), JsonOptions)
                ?? throw new InvalidDataException("Configuration must be a JSON object.")
            : new SettingsFile();

        if (string.IsNullOrWhiteSpace(settings.City) || settings.City.Trim().Length < 2)
            throw new InvalidDataException("City must contain at least two characters.");
        if (settings.Unit is not ("celsius" or "fahrenheit"))
            throw new InvalidDataException("Unit must be 'celsius' or 'fahrenheit'.");

        return new WeatherSettings(settings.City, settings.Unit);
    }

    private static string GetConfigPath()
    {
        var configRoot = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
        if (string.IsNullOrEmpty(configRoot) || !Path.IsPathFullyQualified(configRoot))
            configRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config");
        return Path.Combine(configRoot, "desktop-weather", "config.json");
    }

    private sealed record SettingsFile
    {
        public string? City { get; init; } = "London, United Kingdom";
        public string? Unit { get; init; } = "celsius";
    }
}
