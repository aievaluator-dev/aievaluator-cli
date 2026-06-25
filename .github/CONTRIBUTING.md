# Contributing to AI Evaluator CLI

Thanks for your interest in contributing! This guide covers how to set up, develop, and submit changes.

## Monorepo structure

```
aievaluator-cli/
├── python/          → PyPI (pip install aievaluator)
├── node/            → npm (npm install -g aievaluator)
├── dotnet/          → NuGet (dotnet tool install -g aievaluator)
├── go/              → go install
├── vscode/          → VS Code Marketplace
├── shared/          → API surface + format specs
└── ci-templates/    → GitHub Actions / GitLab CI / Jenkins
```

## Development setup

```bash
git clone https://github.com/aievaluator-dev/aievaluator-cli.git
cd aievaluator-cli
```

Then pick your language:

### Python
```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest tests/ -v
```

### Node.js
```bash
cd node
npm ci
npm test
```

### Go
```bash
cd go
go build ./cmd/aievaluator/
go test ./... -v
```

### C# / .NET
```bash
cd dotnet
dotnet build src/
dotnet test
```

### VS Code Extension
```bash
cd vscode
npm ci
npm run compile
```

## How to contribute

1. **Find or create an issue** — bugs, features, docs, all welcome.
2. **Fork the repo** and create a branch: `git checkout -b feat/my-feature`.
3. **Make your changes** — keep them focused on one thing.
4. **Test**: run the language-specific test suite (see above).
5. **Submit a PR** to `master` with a clear description.

## Pull request guidelines

- One feature or fix per PR.
- Include tests for new functionality.
- Follow existing code style (PEP 8 for Python, `gofmt` for Go, etc.).
- Update docs if you change behavior.

## Versioning

Versions are managed per-language. **Do not bump versions in your PR.**  
Maintainers handle version bumps after merge using `./bump.sh <lang> <level>`.

See [`bump.sh`](../bump.sh) for details.

## License

MIT — see [LICENSE](../LICENSE).
