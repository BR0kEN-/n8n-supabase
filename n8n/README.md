# N8N

- These workflows and credentials are automatically imported locally on `./.local/cli up`.
- You can cross-reference credentials in the workflows by IDs.
- You can use [Handlebars](https://handlebarsjs.com/) syntax within the credential JSON files. The `.env` values are available inside.
- Run `./.local/cli upenv` to update the `.env` and re-import workflows and credentials.

  **IMPORTANT**:
  - The only source of truth is the code.
  - The changes made in the UI will be lost.
  - The command runs automatically on `up`.
  - Non-exported workflows/credentials stay intact.
