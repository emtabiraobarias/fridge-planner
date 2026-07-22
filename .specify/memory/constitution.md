<!--
  SYNC IMPACT REPORT
  ==================
  Version Change: [Not previously versioned] → 1.0.0
  
  Modified Principles:
  - All principles newly defined (initial constitution)
  
  Added Sections:
  - Core Principles (12 principles based on twelve-factor app methodology)
  - Security & Authentication
  - Code Quality & Testing Standards
  - Performance & Scalability
  - Governance
  
  Removed Sections:
  - None (initial version)
  
  Templates Requiring Updates:
  ✅ Updated: .specify/templates/plan-template.md
  ✅ Updated: .specify/templates/spec-template.md
  ✅ Updated: .specify/templates/tasks-template.md
  
  Follow-up TODOs:
  - None - all placeholders filled
-->

# Fridge Planner Constitution

## Core Principles

### I. Codebase (Single Source, Many Deploys)

One codebase tracked in version control, many deployments. The application MUST:
- Maintain a single repository with all source code
- Use Git with feature branches for all development
- Support multiple deployment environments (dev, staging, production) from the same codebase
- Never have environment-specific code branches

**Rationale**: Single codebase ensures consistency across environments and simplifies CI/CD
pipelines while preventing configuration drift.

### II. Dependencies (Explicitly Declared and Isolated)

All dependencies MUST be explicitly declared and isolated. The application MUST:
- Use package managers (npm/yarn for frontend, pip/poetry for backend, etc.)
- Include lock files (package-lock.json, poetry.lock) in version control
- Never rely on implicit system-wide packages
- Provide reproducible builds across all environments

**Rationale**: Explicit dependency declaration prevents "works on my machine" issues and
ensures consistent behavior across development and production environments.

### III. Configuration (Stored in Environment)

Configuration that varies between deployments MUST be stored in environment variables. The
application MUST:
- Never hard-code credentials, API keys, or environment-specific values
- Use .env files for local development (excluded from version control)
- Store all secrets in secure vaults (AWS Secrets Manager, Azure Key Vault, etc.)
- Validate required environment variables at startup

**Rationale**: Separating config from code enables secure credential management and
environment-agnostic deployments.

### IV. Backing Services (Treated as Attached Resources)

All backing services (databases, caches, message queues, external APIs) MUST be treated as
attached resources. The application MUST:
- Access all backing services via URLs or connection strings from config
- Support swapping backing services without code changes
- Handle service failures gracefully with retry logic and circuit breakers
- Abstract service interfaces to allow local/remote interchangeability

**Rationale**: Treating services as resources enables flexible deployment topologies and
simplifies testing with mock services.

### V. Build, Release, Run (Strictly Separate Stages)

The application MUST maintain strict separation between build, release, and run stages:
- **Build**: Transform code into executable bundle with dependencies
- **Release**: Combine build with config for specific environment
- **Run**: Execute the release in the runtime environment
- Use immutable releases with unique IDs (semantic version + commit hash)
- Never modify code at runtime

**Rationale**: Separation enables rollback capabilities, audit trails, and prevents
configuration errors from affecting code integrity.

### VI. Processes (Stateless and Share-Nothing)

Application processes MUST be stateless and share-nothing. The application MUST:
- Store all persistent state in backing services (databases, caches)
- Never rely on sticky sessions or in-memory state
- Use stateless authentication (JWT tokens, OAuth 2.0)
- Design for horizontal scalability with process replication

**Rationale**: Stateless processes enable seamless scaling, rolling deployments, and
recovery from failures without data loss.

### VII. Port Binding (Export Services via Port)

The application MUST be self-contained and export services via port binding. The application
MUST:
- Embed the web server (Express, FastAPI, etc.) within the application
- Never rely on runtime injection of external servers
- Bind to a port specified by environment variable (default: 3000 for frontend, 8000 for
  backend)
- Support HTTP/2 and WebSocket connections for real-time features

**Rationale**: Self-contained services simplify deployment and enable the app to become a
backing service for other applications.

### VIII. Concurrency (Scale Out via Process Model)

The application MUST scale horizontally via the process model. The application MUST:
- Divide workload by process type (web, worker, scheduler)
- Use process managers (PM2, systemd, Kubernetes) for process lifecycle
- Never daemonize or write PID files internally
- Handle SIGTERM gracefully for zero-downtime deployments

**Rationale**: Process-based concurrency enables fine-grained resource allocation and
aligns with cloud-native orchestration platforms.

### IX. Disposability (Fast Startup and Graceful Shutdown)

Processes MUST be disposable with fast startup and graceful shutdown. The application MUST:
- Start in under 10 seconds from launch command
- Handle SIGTERM by stopping new requests, completing in-flight requests, and exiting
- Use health check endpoints (/health, /ready) for orchestration
- Support rolling deployments without service interruption

**Rationale**: Disposability enables rapid scaling, robust deployments, and resilience to
infrastructure failures.

### X. Dev/Prod Parity (Keep Development and Production Similar)

The gap between development and production MUST be minimal. The application MUST:
- Use the same backing services in dev and prod (PostgreSQL in both, never SQLite in dev)
- Deploy frequently (hourly or daily) to reduce change batch size
- Use containerization (Docker) to ensure environment parity
- Provide seed data and migration scripts for consistent local setup

**Rationale**: Minimizing dev/prod differences reduces deployment risks and enables
developers to diagnose production issues effectively.

### XI. Logs (Treat as Event Streams)

Logs MUST be treated as time-ordered event streams. The application MUST:
- Write all logs to stdout/stderr without managing log files
- Use structured logging (JSON format) with correlation IDs
- Never route or store logs within the application
- Rely on execution environment for log aggregation (CloudWatch, ELK, Datadog)

**Rationale**: Treating logs as streams separates concerns and enables flexible log
analysis without modifying application code.

### XII. Admin Processes (Run as One-Off Tasks)

Administrative and maintenance tasks MUST run as one-off processes. The application MUST:
- Provide CLI commands for migrations, data fixes, and reports
- Run admin tasks in the same environment as regular processes
- Use the same codebase and config as the deployed release
- Provide REPL access for debugging (with audit logging)

**Rationale**: Running admin tasks in the same environment ensures consistency and prevents
configuration mismatches.

## Security & Authentication

All backend API endpoints MUST implement OAuth 2.0 / OpenID Connect (OIDC) authentication.
The application MUST:
- Use industry-standard OAuth 2.0 flows (Authorization Code + PKCE for web/mobile)
- Integrate with identity providers (Auth0, Okta, AWS Cognito, Azure AD)
- Validate JWT tokens on every API request with signature verification
- Implement role-based access control (RBAC) with granular permissions
- Support API key authentication for LLM agent integrations (with rate limiting)
- Enforce HTTPS for all communications (TLS 1.3 minimum)
- Implement CORS policies to restrict cross-origin requests
- Use security headers (Content-Security-Policy, X-Frame-Options, etc.)
- Audit all authentication and authorization events

**Rationale**: OAuth 2.0/OIDC provides industry-standard security for modern web
applications and enables secure integration with external systems including LLM agents.

## Code Quality & Testing Standards

### Testing Discipline (NON-NEGOTIABLE)

Test-driven development (TDD) is MANDATORY for all features. The application MUST:
- Write tests BEFORE implementation (Red-Green-Refactor cycle)
- Achieve minimum 80% code coverage for backend, 70% for frontend
- Include unit tests for business logic (isolated, fast)
- Include integration tests for API contracts (request/response validation)
- Include end-to-end tests for critical user journeys (Playwright, Cypress)
- Run all tests in CI/CD pipeline before deployment
- Block merges if tests fail or coverage decreases

**Rationale**: TDD prevents regressions, documents intent, and ensures code reliability
under refactoring.

### Code Quality Standards

All code MUST meet these quality standards:
- Follow language-specific style guides (Airbnb for JavaScript/TypeScript, PEP 8 for
  Python)
- Use linters (ESLint, Pylint) and formatters (Prettier, Black) with pre-commit hooks
- Conduct peer code reviews for all pull requests
- Maintain cyclomatic complexity below 10 for functions
- Document public APIs with JSDoc/docstrings
- Refactor duplicated code (DRY principle)
- Write self-documenting code with descriptive names

**Rationale**: Consistent code quality reduces cognitive load, prevents bugs, and
facilitates team collaboration.

## Performance & Scalability

The application MUST provide fluid user experience across devices with robust performance:
- **API Response Time**: p95 latency under 200ms for synchronous endpoints
- **Frontend Performance**: Time to Interactive (TTI) under 3 seconds on 3G networks
- **Responsive Design**: Fluid layout across mobile (320px), tablet (768px), desktop
  (1920px)
- **Progressive Web App (PWA)**: Offline support with service workers and local caching
- **Accessibility**: WCAG 2.1 AA compliance for inclusive design
- **Database Queries**: Use indexes, connection pooling, and query optimization
- **Caching Strategy**: Implement Redis for session/query caching with TTL policies
- **CDN Usage**: Serve static assets via CDN with cache headers
- **Horizontal Scalability**: Design for auto-scaling with stateless architecture
- **Load Testing**: Validate performance under expected load (1000 concurrent users minimum)

**Rationale**: Modern web applications demand performant, accessible experiences across
diverse devices and network conditions.

## API-First Architecture

All backend functionality MUST be exposed via RESTful API endpoints to enable LLM agent
integration. The application MUST:
- Design APIs before implementation (API-first approach)
- Document all endpoints with OpenAPI 3.0 specification
- Version APIs explicitly in URL path (/api/v1/resource)
- Return consistent JSON responses with standard error formats (RFC 7807)
- Implement rate limiting per client (100 req/min default, configurable per API key)
- Support pagination for list endpoints (cursor-based for large datasets)
- Provide webhooks for asynchronous operations
- Enable CORS for authorized origins only
- Support content negotiation (JSON, MessagePack for efficiency)

**Rationale**: API-first design enables seamless integration with LLM agents, third-party
services, and future frontend implementations.

## Governance

This constitution supersedes all other development practices and standards. All team members
MUST:
- Verify compliance with constitutional principles in code reviews
- Document and justify any exceptions with architectural decision records (ADRs)
- Propose amendments via pull request with impact analysis
- Conduct quarterly constitution reviews to ensure alignment with evolving requirements

### Amendment Procedure

1. Propose amendment via pull request to this file
2. Document rationale and migration plan
3. Obtain approval from technical lead and product owner
4. Update dependent templates and documentation
5. Increment version according to semantic versioning rules

### Versioning Policy

- **MAJOR**: Backward incompatible changes (principle removal or redefinition)
- **MINOR**: New principles or material guidance expansions
- **PATCH**: Clarifications, wording improvements, non-semantic refinements

### Compliance Review

Constitution compliance MUST be verified at these checkpoints:
- Pull request reviews (principles adherence)
- Sprint retrospectives (process alignment)
- Quarterly architecture reviews (system-wide audit)
- Pre-release validation (deployment readiness)

**Version**: 1.0.0 | **Ratified**: 2026-02-15 | **Last Amended**: 2026-02-15
