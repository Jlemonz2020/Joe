# Continuous execution policy

## User authorization

The user approved continuous execution with:

> 现在你直接往下执行，不需要问我，有问题为自然会打断你

## Updated gate rule

Starting after Phase 004, Codex may continue from one phase to the next after AI self-audit, cleanup, commit, and GitHub push succeed.

## When to pause anyway

Pause and ask the user only when a phase requires one of these decisions:

- A subjective visual choice that cannot be inferred from the pink Sailei diary direction
- A deployment or rollback action that changes the live site
- New credentials, permissions, payments, or external account setup
- A proposed change to backend, database, admin, or Nginx behavior
- A direction that conflicts with the user’s stated taste

## What still remains mandatory

- Keep one archive directory per phase
- Keep report, audit, cleanup, and artifacts per phase
- Commit and push each phase to GitHub
- Do not modify the live website unless the phase explicitly allows it
- Preserve the pink anime Sailei diary direction
