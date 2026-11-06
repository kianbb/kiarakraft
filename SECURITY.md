# Security policy

Kiara Kraft is prelaunch software. Security controls, tests and dependency scans provide evidence for their covered behavior; they do not certify a deployment or guarantee that vulnerabilities are absent.

## Reporting

Report suspected vulnerabilities through [GitHub private vulnerability reporting](https://github.com/kianbb/kiarakraft/security/advisories/new). This reporting channel is enabled for this repository. Do not post exploit instructions, credentials or personal information in public issues, pull requests or build artifacts.

Include the affected revision, expected and observed behavior, impact, and a minimal reproduction using synthetic data. Redact tokens and private records. Test hosted systems only with explicit authorization, and avoid accessing other users' information or causing disruption.

Maintainers should acknowledge and triage reports privately, agree on a remediation/disclosure plan, and keep sensitive evidence restricted. This policy does not promise a response deadline or authorize testing beyond an agreed scope.

## Contributor expectations

Use the isolated workflow in [development](docs/development.md). Keep hosted credentials and real personal information out of development workers and tests. Never print secret values or matching secret lines; provide redacted locations when reporting scanner findings.

Run relevant regressions, staged secret scanning and dependency checks before requesting review. Keep failures visible. Do not weaken guards, assertions or security gates merely to obtain a passing result. Removing a credential from the repository does not revoke it; suspected exposure requires a private response and verified revocation or rotation.

Review publication history and artifacts as well as the final source tree. Detailed unresolved findings and confidential evidence belong in private coordination channels.

## Releases

Require human review of the integrated change and deliberate release approval. Check authorization, data isolation, migration/recovery planning, provider behavior and deployment configuration for the affected scope. Builds do not apply hosted migrations automatically.

Follow [staging](docs/staging.md) for synthetic hosted verification. CI or GitHub environment approval alone does not establish that a separate hosting provider's deployment path is protected. Verify deployed revisions and access controls directly before handling real customer data or money.
