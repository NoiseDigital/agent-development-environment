# Contributing

## Devcontainer Setup

Open the repo in VS Code and select **Reopen in Container**. The **Start Services** task runs automatically on open and runs `scripts/devcontainer_start.sh`. It handles `.env` creation, GCP authentication, and starting all app services. See [README](README.md) for the full flow.

**Git identity** — ensure git is configured on your host before opening the container, so your identity is available inside:

```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

## Branching Strategy

We follow **trunk-based development**. All work flows through `main`.

- Branch off `main` for your change, merge back
- Keep branches short-lived and focused — one logical change per branch
- Never commit directly to `main`

**Branch naming:**

```
feat/short-description        # new feature or agent
fix/short-description         # bug fix
chore/short-description       # tooling, deps, config, infra
docs/short-description        # documentation only
refactor/short-description    # no behaviour change
```

Examples: `feat/add-data-agent`, `fix/mcp-protocol-version`, `chore/upgrade-adk-1.32`

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <short summary>
```

Use the **service name** as scope, and drill down to the agent if the change is agent-specific:

| Type | Use for |
|---|---|
| `feat` | New agent, tool, or user-facing capability |
| `fix` | Bug fix |
| `chore` | Dependency update, config, build, infra |
| `docs` | README, comments, CONTRIBUTING only |
| `refactor` | Code restructure with no behaviour change |

**Scope conventions:**

| Scope | Use for |
|---|---|
| `agents` | Changes across the agent service generally |
| `agents/media-agent` | Changes specific to one agent |
| `database` | DB schema, init scripts |
| `mcp` | MCP Toolbox service or `tools.yaml` |
| `frontend` | Next.js app |
| `infra` | docker-compose, Dockerfiles, Terraform |
| `deps` | Dependency bumps |

**Examples:**
```
feat(agents/media-agent): add campaign spend breakdown tool
feat(agents): add timesheet agent with Asana integration
fix(agents/gcp-release-notes): pin MCP_v20250326 protocol
fix(database): add missing index on session_id
chore(deps): upgrade google-adk to 1.32.0
chore(infra): remove dead MCP_SERVER_URL from agent env
docs: update README getting started section
refactor(frontend): extract agent config to agentConfig.tsx
```

- Keep the summary under 72 characters
- Use the imperative mood — "add", not "added" or "adds"
- Reference issues where relevant: `fix(mcp): handle empty toolset (#42)`

## CI Requirements

All PRs must pass the following checks before merge:

| Check | What it runs |
|---|---|
| `Backend — ruff + mypy` | `ruff check` + `ruff format --check` on `services/backend/agents/` |
| `Frontend — ESLint + TypeScript` | `next lint` + `tsc --noEmit` on `services/frontend/` |
| `Terraform — fmt + validate` | `terraform fmt -check` + `terraform validate` on `terraform/` |
| `Docker Compose — config validation` | `docker compose config` on root `docker-compose.yml` |

Fix lint failures locally before pushing — `ruff check --fix .` and `ruff format .` handle most Python issues automatically.

## Pre-commit Hooks

Hooks are installed automatically in the devcontainer. Outside the devcontainer, run once:

```bash
uv tool install pre-commit   # or: pipx install pre-commit
pre-commit install
```

Hooks run on every `git commit`:
- **ruff** — lint + autofix Python
- **ruff-format** — format Python
- **detect-private-key** — blocks accidental credential commits
- **check-ast** — validates Python syntax
- **check-added-large-files** — warns on files > 1 MB
- **terraform_fmt** — formats `.tf` files
- Standard hygiene (trailing whitespace, EOF, YAML/JSON/TOML validity)

To run all hooks manually: `pre-commit run --all-files`

## Pull Requests

The repo enforces **squash merges only**. The PR title and description become the single commit on `main` — individual commit messages are not read by release tooling (unless there is only one commit, in which case it becomes the PR title automatically).

**PR title** — must be a valid conventional commit:
```
feat(agents/media-agent): add campaign spend breakdown tool
```

**PR description** — include a conventional commit log of all logical changes so automated release tools can pick them up:
```
feat(agents/media-agent): add campaign spend breakdown tool
fix(agents/media-agent): handle empty toolset response gracefully
chore(deps): add pandas>=2.0 to pyproject.toml
```

If the PR only contains one logical change the description log can be omitted — the title is sufficient.

Other guidelines:
- Keep PRs small and reviewable — one concern per PR
- Self-review before requesting review — check diffs, remove debug code
- Link to any agent or tool being meaningfully changed

## Adding an Agent

1. Create `services/backend/agents/adk_agents/<agent_name>/`
2. Add `__init__.py` and `agent.py` with a top-level `root_agent` variable
3. Add display config to `services/frontend/src/config/agentConfig.tsx`:
   - `hidden: true` — agent exists in backend but is not shown in the UI
   - `comingSoon: true` — agent appears in the library as a disabled card with a "Coming soon" badge
   - Omit both (or set neither) for a fully active agent
4. Document any new env vars in `.env.example`

## Adding MCP Tools

1. Add `source`, `tool`, and `toolset` documents to `services/backend/mcp/mcp-toolbox/tools.yaml`
2. Each document is separated by `---` (v1.0+ flat format)
3. Restart the mcp service to reload: `docker compose restart mcp`

## Environment Variables

- All new env vars go in `.env.example` with a descriptive comment
- Variables used client-side in Next.js **must** be prefixed `NEXT_PUBLIC_`
- Variables used server-side (agent, MCP) do not need the prefix
- Never commit `.env` — it is gitignored

## Dependency Changes

- Python: update `pyproject.toml`, then run `docker compose exec agent uv sync`
- Node: update `package.json`, then run `docker compose exec frontend npm install`
- Rebuild the image if adding system-level dependencies: `docker compose build <service>`
