# Railway Deployment Guide

This project uses Railway's config-as-code. After one-time setup, all configuration is managed via files.

## Quick Start (API Deployment)

Deploy all services with a single command using the Railway GraphQL API:

```bash
# 1. Get your API token from https://railway.com/account/tokens
export RAILWAY_API_TOKEN="your-token-here"

# 2. (Optional) Set OpenAI key for Graphiti entity resolution
export OPENAI_API_KEY="sk-..."

# 3. Deploy all services
npm run deploy:railway
```

This will:
- Create a new Railway project (or use existing if `RAILWAY_PROJECT_ID` is set)
- Deploy FalkorDB from template or Docker image
- Create Almoner (Node.js) and Graphiti (Python) services
- Configure all environment variables with service references
- Create public domains
- Trigger initial deployments

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RAILWAY_API_TOKEN` | Yes | Railway API token from account settings |
| `RAILWAY_PROJECT_ID` | No | Use existing project instead of creating new |
| `GITHUB_REPO` | No | GitHub repo (default: `ohana-garden/Almoner`) |
| `RAILWAY_BRANCH` | No | Branch to deploy (default: `main`) |
| `OPENAI_API_KEY` | No | OpenAI key for Graphiti entity resolution |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Railway Project                       │
├─────────────────┬─────────────────┬─────────────────────┤
│    Almoner      │    Graphiti     │     FalkorDB        │
│   (Node.js)     │    (Python)     │    (Template)       │
│   Port 8080     │    Port 8000    │    Port 6379        │
├─────────────────┼─────────────────┼─────────────────────┤
│ railway.toml    │ railway.toml    │   (Railway UI)      │
│ (repo root)     │ (graphiti-svc/) │                     │
└─────────────────┴─────────────────┴─────────────────────┘
         │                 │                   │
         └────────────────ALL────────────────┘
                          │
                    FALKORDB_URL
```

## One-Time Setup (Railway Dashboard)

### 1. Create FalkorDB Service
- New → Database → FalkorDB (or Redis template)
- Note the service name (e.g., "FalkorDB")

### 2. Create Almoner Service
- New → GitHub Repo → Select Almoner
- Settings → Source: Branch = `main` (or your branch)
- Variables:
  ```
  FALKORDB_URL=${{FalkorDB.REDIS_URL}}
  FALKORDB_GRAPH=almoner
  GRAPHITI_ENDPOINT=http://${{graphiti.RAILWAY_PRIVATE_DOMAIN}}:8000
  ```

### 3. Create Graphiti Service
- New → GitHub Repo → Select Almoner (same repo)
- Settings → Source:
  - Root Directory = `graphiti-service`
  - Config File Path = `graphiti-service/railway.toml`
- Variables:
  ```
  FALKORDB_URL=${{FalkorDB.REDIS_URL}}
  FALKORDB_GRAPH=almoner
  OPENAI_API_KEY=<your-key>
  ```

## Config-as-Code Files

After setup, Railway reads config from these files:

| Service  | Config File                      |
|----------|----------------------------------|
| Almoner  | `railway.toml` (repo root)       |
| Graphiti | `graphiti-service/railway.toml`  |

### What's Configured in Code

- Build commands and builder type
- Start commands
- Health check paths
- Watch patterns (which files trigger redeploy)
- Restart policies

### What's NOT in Code (Dashboard Only)

- Service creation and linking
- Environment variables with `${{service.VAR}}` references
- Domain assignments
- Resource limits

## Environment Variables Reference

| Variable           | Service  | Value                                              |
|--------------------|----------|----------------------------------------------------|
| FALKORDB_URL       | Both     | `${{FalkorDB.REDIS_URL}}`                          |
| FALKORDB_GRAPH     | Both     | `almoner`                                          |
| GRAPHITI_ENDPOINT  | Almoner  | `http://${{graphiti.RAILWAY_PRIVATE_DOMAIN}}:8000` |
| OPENAI_API_KEY     | Graphiti | Your OpenAI API key                                |

## Testing Endpoints

```bash
# Almoner health
curl https://almoner-production.up.railway.app/health

# Graphiti health
curl https://graphiti-production.up.railway.app/health

# Seed database
curl -X POST https://almoner-production.up.railway.app/seed
```

## Troubleshooting

### "Database disconnected"
- Check FALKORDB_URL variable uses `${{FalkorDB.REDIS_URL}}`
- Verify FalkorDB service is running

### Graphiti building Node.js instead of Python
- Ensure Root Directory = `graphiti-service`
- Ensure Config File Path = `graphiti-service/railway.toml`

### Changes not deploying
- Check watch patterns in railway.toml
- Verify you're pushing to the correct branch

## API Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run deploy:railway` | Full automated deployment via GraphQL API |
| `./scripts/railway-setup.sh` | Interactive setup (prompts for IDs) |
| `npx ts-node scripts/railway-setup.ts` | Interactive TypeScript setup |

### Railway GraphQL API

The deployment scripts use Railway's public GraphQL API:

- **Endpoint:** `https://backboard.railway.com/graphql/v2`
- **Auth:** Bearer token from [account settings](https://railway.com/account/tokens)

Key mutations used:
- `projectCreate` - Create new Railway project
- `serviceCreate` - Create service from GitHub repo or Docker image
- `templateDeployV2` - Deploy from Railway template (FalkorDB)
- `variableUpsert` - Set environment variables
- `serviceDomainCreate` - Create public domain
- `serviceInstanceRedeploy` - Trigger redeployment
