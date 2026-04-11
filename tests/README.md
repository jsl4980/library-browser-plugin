# Test Strategy

This test suite is organized around user-story traceability and two levels of integration coverage.

## Suites

- `npm test`
  - Runs deterministic fixture-based integration tests.
  - Covers OCPL connector behavior and page-to-connector rendering behavior.
  - Intended to gate normal development and pull requests.
- `npm run test:live`
  - Runs opt-in live smoke checks against the OCPL Polaris catalog.
  - Intended to catch catalog drift and real-world connector failures.
  - Not recommended as a required CI gate until the Polaris behavior proves stable.

## Traceability

- User stories live in `tests/traceability/user-stories.json`
- Test cases live in `tests/traceability/test-cases.json`
- OCPL connector fixtures live under `tests/fixtures/ocpl/`
- Goodreads and Amazon page fixtures live under `tests/fixtures/pages/`

Each integration test references a stable test-case ID and validates that the linked user stories exist. This keeps coverage maintainable as more connectors or user stories are added.
