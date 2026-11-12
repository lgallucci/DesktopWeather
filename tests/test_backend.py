import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


BACKEND = (
    Path(__file__).resolve().parents[1]
    / "src/DesktopWeather.Backend/bin/Release/net10.0/DesktopWeather.Backend.dll"
)


class ConfigurationTests(unittest.TestCase):
    def run_backend(self, config):
        with tempfile.TemporaryDirectory() as directory:
            config_dir = Path(directory) / "desktop-weather"
            config_dir.mkdir()
            (config_dir / "config.json").write_text(config, encoding="utf-8")
            return subprocess.run(
                ["dotnet", str(BACKEND)],
                env={**os.environ, "XDG_CONFIG_HOME": directory},
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )

    def test_invalid_unit_is_reported(self):
        result = self.run_backend(json.dumps({"city": "London", "unit": "kelvin"}))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unit must", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_invalid_city_is_reported(self):
        result = self.run_backend(json.dumps({"city": " ", "unit": "celsius"}))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("City must", result.stderr)
        self.assertEqual(result.stdout, "")

    def test_malformed_json_is_reported(self):
        result = self.run_backend("{")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Desktop Weather:", result.stderr)
        self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
