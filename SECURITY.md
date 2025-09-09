# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |

## Security Measures

### Authentication

- Password hashing with bcryptjs
- Rate limiting: 5 login attempts before 15-minute lockout
- IP-based rate limiting: 10 attempts per minute
- JWT session tokens with 24-hour expiration
- Strong password requirements enforced

### Data Protection

- Environment variables for sensitive configuration
- Database connection pooling with SSL
- CSRF protection enabled
- XSS protection via Content Security Policy

### Payment Security

- Payment gateway integration (ZarinPal/IDPay) with server-side validation
- No credit card data stored locally
- Payment verification callbacks validated server-side

## Reporting a Vulnerability

Please report security vulnerabilities to:

- Email: security@kiarakraft.com (if available)
- Or create a private security advisory on GitHub

**Do NOT create public issues for security vulnerabilities.**

### Response Time

- Critical vulnerabilities: 24 hours
- High severity: 48 hours
- Medium/Low severity: 1 week

## Development Security Checklist

### Before Each Deploy

- [ ] Run `npm audit` to check for vulnerabilities
- [ ] Review Dependabot security alerts
- [ ] Ensure no secrets in code (`git secrets --scan`)
- [ ] Verify environment variables are set correctly
- [ ] Check authentication endpoints are protected

### Regular Maintenance

- [ ] Weekly: Review and merge Dependabot PRs
- [ ] Monthly: Full security audit
- [ ] Quarterly: Review and update dependencies
- [ ] Annually: Security penetration testing

## Known Security Considerations

### Current Status

- **Low severity vulnerabilities** in dev dependency `@lhci/cli` (not production-affecting)
- All production dependencies are up-to-date with no known vulnerabilities

### Recommended Improvements

1. Consider migrating from bcryptjs to native bcrypt for better performance
2. Implement 2FA for seller accounts handling money
3. Add request signing for payment webhooks
4. Implement API rate limiting for public endpoints
5. Add security headers middleware (helmet.js)

## Security Headers

Current headers configured:

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HTTPS only)
- Content-Security-Policy (configured)

## Dependency Management

- Automated updates via Dependabot (weekly)
- Grouped updates for minor/patch versions
- Manual review for major version updates
- Security updates prioritized

Last security audit: 2025-09-09
