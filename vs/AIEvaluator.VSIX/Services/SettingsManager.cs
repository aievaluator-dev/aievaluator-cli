using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;

namespace AIEvaluator.VSIX.Services
{
    /// Simple file-based settings manager (VS Settings Store replacement for portability).
    public class SettingsManager
    {
        private readonly string _settingsDir;

        public SettingsManager()
        {
            _settingsDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "AIEvaluator");
            Directory.CreateDirectory(_settingsDir);
        }

        public Task<string?> LoadAsync(string key)
        {
            var path = GetPath(key);
            if (!File.Exists(path)) return Task.FromResult<string?>(null);

            try
            {
                var data = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(path));
                return Task.FromResult(data?.GetValueOrDefault("value"));
            }
            catch
            {
                return Task.FromResult<string?>(null);
            }
        }

        public async Task SaveAsync(string key, string value)
        {
            var path = GetPath(key);
            var data = new Dictionary<string, string> { ["value"] = value };
            await File.WriteAllTextAsync(path, JsonSerializer.Serialize(data));
        }

        private string GetPath(string key) =>
            Path.Combine(_settingsDir, $"{Sanitize(key)}.json");

        private static string Sanitize(string key) =>
            string.Join("_", key.Split(Path.GetInvalidFileNameChars()));
    }
}
