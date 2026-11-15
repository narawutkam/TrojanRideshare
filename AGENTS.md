# HackSC agent instructions

Read [README.md](README.md) before changing code. It is the central product and technical contract. In the README, PRD identifies source requirements, Proposed identifies designs for team approval, and Open identifies decisions that remain unresolved. Read the decision log at `docs/decisions.md` once it exists.

## Before editing

- Identify the assigned feature, its owner and allowed paths using the README ownership table. Review existing shared types, services, validators and fixtures.
- Check the decision register. The PRD gives both four and six occupants. The mock fixture uses four including the Booker. Live capacity requires an approved value. Use the server-configured capacity and per-trip snapshot.
- Use the shared mock adapters while a provider is unavailable. Keep mock identities and seed state isolated from live deployments.

## While editing

- Import contracts from `src/types/` and call the shared service interfaces. Use the shared API envelope, errors and UTC timestamp rules. Keep database field mapping in the data layer.
- Preserve authorization and transaction invariants. Derive the actor from the session. Enforce trip capacity, agreement acceptance and membership atomically. Restrict chat to current confirmed members.
- Work in the assigned feature scope. Propose changes to public contracts, dependencies, shared paths or migrations to the integration owner with affected consumers and validation steps. Keep the README and code contracts synchronized in the same PR.

## Handoff

- Work on a `feature/<area>` branch and merge through a PR to `main`. Use the setup and check commands in the README once the scaffold defines them.
- Run the checks and the affected integration scenario. Include verification steps, known limitations, dependencies and migration effects. Add screenshots for visible changes.
