using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Collections.ObjectModel;

namespace AIEvaluator.VSIX.ViewModels
{
    public class AIEvaluatorViewModel : INotifyPropertyChanged
    {
        private string _statusMessage = "";
        private string _apiKeyStatus = "Not set";
        private ObservableCollection<HistoryItem> _recentHistory = new();

        public string StatusMessage
        {
            get => _statusMessage;
            set { _statusMessage = value; OnPropertyChanged(); }
        }

        public string ApiKeyStatus
        {
            get => _apiKeyStatus;
            set { _apiKeyStatus = value; OnPropertyChanged(); }
        }

        public ObservableCollection<HistoryItem> RecentHistory
        {
            get => _recentHistory;
            set { _recentHistory = value; OnPropertyChanged(); }
        }

        public event PropertyChangedEventHandler? PropertyChanged;
        protected void OnPropertyChanged([CallerMemberName] string? name = null)
            => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    }

    public class HistoryItem
    {
        public string Query { get; set; } = "";
        public string Scores { get; set; } = "";
        public bool Passed { get; set; }
        public string Response { get; set; } = "";
        public string Expected { get; set; } = "";
    }
}
