# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [single/web/mobile - determines source structure]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature MUST comply with all constitutional principles:

**Twelve-Factor App Compliance**:
- [ ] **Codebase**: Single repository, feature branch created
- [ ] **Dependencies**: All dependencies explicitly declared in package manifests
- [ ] **Config**: Environment variables defined for all environment-specific values
- [ ] **Backing Services**: Services accessed via config URLs (database, cache, external APIs)
- [ ] **Build/Release/Run**: Separation maintained with immutable releases
- [ ] **Processes**: Stateless design with no in-memory session state
- [ ] **Port Binding**: Self-contained service with configurable port binding
- [ ] **Concurrency**: Horizontally scalable with process-based architecture
- [ ] **Disposability**: Fast startup (<10s), graceful shutdown (SIGTERM handling)
- [ ] **Dev/Prod Parity**: Same backing services in dev and prod (Docker containers)
- [ ] **Logs**: Structured JSON logs to stdout/stderr
- [ ] **Admin Processes**: Admin tasks via CLI commands in same environment

**Security Requirements**:
- [ ] OAuth 2.0/OIDC authentication for all API endpoints
- [ ] JWT token validation with signature verification
- [ ] RBAC implementation with granular permissions
- [ ] API key support for LLM agent integration with rate limiting
- [ ] HTTPS enforcement (TLS 1.3 minimum)
- [ ] Security headers configured (CSP, X-Frame-Options, etc.)

**Testing Standards**:
- [ ] TDD approach: Tests written before implementation
- [ ] Minimum 80% backend coverage, 70% frontend coverage
- [ ] Unit tests for business logic included
- [ ] Integration tests for API contracts included
- [ ] E2E tests for critical user journeys included
- [ ] CI/CD pipeline configured to block failing tests

**Performance Requirements**:
- [ ] API p95 latency target: <200ms
- [ ] Frontend TTI target: <3s on 3G
- [ ] Responsive design: 320px (mobile) to 1920px (desktop)
- [ ] PWA support with offline capabilities
- [ ] WCAG 2.1 AA accessibility compliance
- [ ] Database indexes and connection pooling configured
- [ ] Caching strategy defined (Redis/CDN)
- [ ] Load testing planned for 1000+ concurrent users

**API-First Architecture**:
- [ ] OpenAPI 3.0 specification documented
- [ ] API versioning in URL path (/api/v1/...)
- [ ] Standard error responses (RFC 7807)
- [ ] Rate limiting per client (100 req/min default)
- [ ] Pagination for list endpoints
- [ ] CORS policy configured

**Code Quality**:
- [ ] Linters configured (ESLint/Pylint)
- [ ] Formatters configured (Prettier/Black)
- [ ] Pre-commit hooks enabled
- [ ] Code review process defined
- [ ] Cyclomatic complexity limits enforced (<10)

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
