# GitHub Actions Setup

## NPM Token Configuration

To enable automatic publishing to npm, you need to:

1. **Get your NPM token:**
   - Login to [npmjs.com](https://www.npmjs.com)
   - Go to your profile → Access Tokens
   - Generate a new token (Automation type recommended)
   - Copy the token

2. **Add token to GitHub:**
   - Go to your repository on GitHub
   - Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: paste your npm token
   - Click "Add secret"

## Usage

### Automatic Publishing

To publish a new version:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit changes:
   ```bash
   git add .
   git commit -m "Release v0.1.0"
   ```
4. Create and push tag:
   ```bash
   git tag v0.1.0
   git push origin main
   git push origin v0.1.0
   ```

The GitHub Action will automatically:
- Run tests
- Publish to npm
- Create a GitHub release

### Manual Publishing

If you prefer to publish manually:
```bash
npm login
npm publish
```

## Workflows

- **ci.yml**: Runs on every push and PR to ensure code quality
- **npm-publish.yml**: Runs only on version tags (v*) to publish to npm
