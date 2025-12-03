# N8N + Supabase

Provision a stack with N8N and Supabase for local development. Ensure the requirements and use the commands below to get started.

## Requirements

- Docker Desktop (Mac/Windows, no Linux operability tested).
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) installed:
  - project-wise via `npm install --save-dev supabase` (prefer this to control the CLI version for a specific project)
  - globally via NPX (run `npx supabase --help` and confirm the installation if missing)

## Commands

### Start

Start the N8N + Supabase stack and update the project's `.env` with the right values.

```bash
./.local/cli up
```

> [!NOTE]
> - The command imports N8N credentials and workflows from code into a launched instance.
> - The Supabase Studio has no credentials and ready for use immediately.
> - Find N8N Owner account credentials in `.env`.
> - You can proceed to the `npm run dev` on completion.
> - If necessary, set the comma-separated value for the `STACK_REQUIRED_VARIABLES` variable in the `.env.example`. Every chunk is a variable that must be manually set in the `.env`.

### Stop

Stop the stack and optionally delete the volumes/data.

```bash
./.local/cli down [-v|--volumes]
```

> [!NOTE]
> The tracked N8N workflows will be exported prior deleting the volumes to not lose the work done. Use `git checkout` if those changes are unnecessary.

### Help

See the CLI help and the application config.

```bash
./.local/cli -h
```

> [!IMPORTANT]
> Please run this command and read the output after starting the stack!
