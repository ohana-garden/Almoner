# Railway Deployment Guide

This project uses Railway's config-as-code. After one-time setup, all configuration is managed via files.

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
