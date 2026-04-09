# Contributing to PromptTrading

Thank you for your interest in contributing.

## Getting Started

1. Fork this repository.
2. Create a feature branch from `main`: `git checkout -b feature/my-change`.
3. Follow the [Quick Start](README.md#quick-start) instructions to set up a local dev environment.
4. Make your changes, keeping commits focused and well-described.
5. Open a pull request against `main`.

## Development Setup

- **Node.js** >= 18
- **PostgreSQL** for the backend and user-management databases
- Copy each `.env.example` to `.env` and fill in your own credentials

## Code Style

- Frontend: React + JSX/TSX, Tailwind CSS, Prettier formatting
- Backend API: Node.js/Express, Prisma ORM
- User Management: Strapi (TypeScript)
- Run `npx prettier --check .` before submitting

## Pull Requests

- Keep PRs small and focused on a single concern.
- Include a clear description of what changed and why.
- Add or update tests when applicable.
- Ensure the app builds and starts without errors.

## Reporting Issues

Use the GitHub issue tracker. Include steps to reproduce, expected behavior, and actual behavior.

## Code of Conduct

Be respectful and constructive. Harassment, discrimination, and bad-faith behavior will not be tolerated.
