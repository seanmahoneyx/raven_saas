# Pre-Production Testing and Deployment Checklist

**Version:** 1.0
**Last Updated:** 2026-01-10
**Status:** Ready for Review

This checklist MUST be completed and verified before deploying Raven SaaS to production.

---

## ✅ Critical Security Configuration

### Environment Variables

- [ ] **Set `DJANGO_DEBUG=False`**
  ```bash
  export DJANGO_DEBUG=False
  # Verify: python manage.py shell -c "from django.conf import settings; print(f'DEBUG={settings.DEBUG}')"
  ```
  - ⚠️ **BLOCKER**: Must be False in production

- [ ] **Generate and set strong `DJANGO_SECRET_KEY`**
  ```bash
  # Generate new key:
  python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
  # Set it:
  export DJANGO_SECRET_KEY='<generated-key>'
  ```
  - ⚠️ **BLOCKER**: Must be unique and secret

- [ ] **Configure `DJANGO_ALLOWED_HOSTS`**
  ```bash
  export DJANGO_ALLOWED_HOSTS="yourdomain.com,*.yourdomain.com"
  ```
  - ⚠️ **BLOCKER**: Must not include `*`

### Database

- [ ] **Migrate from SQLite to PostgreSQL**
  ```bash
  export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
  ```
  - ⚠️ **BLOCKER**: SQLite not suitable for production

- [ ] **Run all migrations**
  ```bash
  python manage.py migrate --check
  python manage.py migrate
  ```

- [ ] **Verify database backups are configured**
  - Daily automated backups
  - Backup retention policy (30 days minimum)
  - Backup restoration tested

### SSL/TLS

- [ ] **SSL certificates installed and valid**
  - Let's Encrypt recommended (free)
  - Certificates auto-renew configured
  - All subdomains covered by certificate

- [ ] **HTTPS redirect working**
  ```bash
  curl -I http://yourdomain.com | grep "301\|302"
  ```

- [ ] **HSTS header present**
  ```bash
  curl -I https://yourdomain.com | grep "Strict-Transport-Security"
  ```

---

## 🔒 Security Testing

### Tenant Isolation Tests

- [ ] **Run tenant isolation security tests**
  ```bash
  pytest security_tests/security_tenant_isolation.py -v
  ```
  - ⚠️ **BLOCKER**: All tests must pass

- [ ] **Manual cross-tenant access test**
  1. Create two test tenants (Tenant A, Tenant B)
  2. Create test data in each tenant
  3. Login as Tenant A user
  4. Attempt to access Tenant B's data via:
     - Direct URL manipulation
     - ID enumeration
     - API requests with different tenant headers
  5. Verify all attempts are blocked (403/404)

- [ ] **Test default tenant fallback is disabled**
  ```bash
  # Access site without valid subdomain - should return 403
  curl -I http://invalid-subdomain.yourdomain.com
  ```

### Authentication & Authorization

- [ ] **Run authentication security tests**
  ```bash
  pytest security_tests/security_auth.py -v
  ```

- [ ] **Test password policy enforcement**
  - Minimum 12 characters
  - Cannot be common passwords
  - Cannot be similar to username

- [ ] **Test session security**
  - Sessions expire after 24 hours
  - Logout invalidates session
  - Session cookies are Secure and HttpOnly

- [ ] **Test admin access**
  - Regular users cannot access /admin/
  - Admin users can only see their tenant's data

### Injection Vulnerabilities

- [ ] **Run injection security tests**
  ```bash
  pytest security_tests/security_injection.py -v
  ```

- [ ] **Manual SQL injection test**
  - Test all form inputs with payloads: `' OR '1'='1`
  - Verify errors are generic (no database errors exposed)

- [ ] **Manual XSS test**
  - Input `<script>alert('XSS')</script>` in all text fields
  - Verify output is escaped in HTML

### CSRF & Security Headers

- [ ] **Run CSRF security tests**
  ```bash
  pytest security_tests/security_csrf_misc.py -v
  ```

- [ ] **Verify security headers present**
  ```bash
  curl -I https://yourdomain.com
  ```
  Expected headers:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=31536000`
  - `Permissions-Policy: ...`

### API Endpoint Security

- [ ] **Run API endpoint security tests**
  ```bash
  pytest security_tests/security_api_endpoints.py -v
  ```

- [ ] **Test unauthenticated access**
  ```bash
  curl -I https://yourdomain.com/v2/ # Should redirect to login
  curl -I https://yourdomain.com/admin/ # Should redirect to login
  ```

---

## 🔧 Functional Testing

### Core Features

- [ ] **User Registration & Login**
  - New user can register
  - User can login with correct credentials
  - User cannot login with wrong credentials
  - Password reset works

- [ ] **Tenant Management**
  - New tenant can be created
  - Tenant subdomain resolves correctly
  - Tenant settings are saved and retrieved
  - Tenant sequences generate unique numbers

- [ ] **Party Management**
  - Can create/edit/delete Parties
  - Can create Customers and Vendors
  - Can manage Locations
  - Data is tenant-isolated

- [ ] **Item Catalog**
  - Can create/edit Items
  - Can create UOM and conversions
  - SKU uniqueness enforced per tenant

- [ ] **Order Management**
  - Can create Purchase Orders
  - Can create Sales Orders
  - Can add line items
  - Order totals calculate correctly
  - Historical changes are tracked

- [ ] **Schedulizer**
  - Calendar view loads
  - Can drag-and-drop orders to schedule
  - Can change order status
  - Can update order notes
  - Side panel shows order details
  - Global history shows activities

### Admin Panel

- [ ] **Admin access control**
  - Only staff users can access
  - Tenant filtering works correctly
  - Bulk actions respect tenant boundaries

- [ ] **Admin functionality**
  - Can view and edit all models
  - Inline editing works (Customer/Vendor, Order Lines)
  - Historical changes viewable
  - Search functionality works

### Data Migration (if applicable)

- [ ] **Legacy data migrated**
  - All data from old system imported
  - Data integrity verified
  - No data loss during migration

---

## 🚀 Performance Testing

### Load Testing

- [ ] **Application handles expected load**
  - Test with expected number of concurrent users
  - Response time < 500ms for 95th percentile
  - No memory leaks during sustained load

### Database Performance

- [ ] **Database queries optimized**
  ```bash
  # Check for N+1 queries
  python manage.py debugsqlshell
  # Or use django-debug-toolbar in staging
  ```

- [ ] **Database indexes present**
  - All foreign keys indexed
  - Tenant + frequently queried fields indexed
  - Check with: `python manage.py sqlsequencereset`

### Static Files

- [ ] **Static files collected and served**
  ```bash
  python manage.py collectstatic
  ```

- [ ] **Static files served by nginx/CDN**
  - Not served by Django
  - Compressed (gzip/brotli)
  - Cached with appropriate headers

---

## 📊 Monitoring & Logging

### Error Tracking

- [ ] **Sentry or error tracking configured**
  - All exceptions logged
  - Email alerts for critical errors
  - Dashboard accessible to team

### Application Monitoring

- [ ] **Application metrics tracked**
  - Request rate
  - Response time
  - Error rate
  - Database connection pool

### Security Monitoring

- [ ] **Security events logged**
  - Failed login attempts
  - Tenant access (especially cross-tenant attempts)
  - Privilege escalation attempts
  - Admin actions

- [ ] **Log retention policy**
  - Logs retained for 90 days minimum
  - Logs backed up and secured
  - Log access restricted

### Uptime Monitoring

- [ ] **Uptime monitoring configured**
  - External service (Pingdom, UptimeRobot, etc.)
  - Alerts on downtime
  - Status page for users

---

## 🔐 Production Security Hardening

### Rate Limiting

- [ ] **Install and configure django-axes**
  ```bash
  pip install django-axes
  # Add to INSTALLED_APPS and configure
  ```

- [ ] **Configure login rate limiting**
  - Max 5 login attempts per 15 minutes
  - Lockout duration: 30 minutes
  - IP-based tracking

### Content Security Policy (CSP)

- [ ] **Install and configure django-csp** (optional but recommended)
  ```bash
  pip install django-csp
  ```

- [ ] **Configure CSP headers**
  ```python
  CSP_DEFAULT_SRC = ("'self'",)
  CSP_SCRIPT_SRC = ("'self'",)
  CSP_STYLE_SRC = ("'self'", "'unsafe-inline'")
  ```

### Server Hardening

- [ ] **Disable server signature**
  - Nginx: `server_tokens off;`
  - Apache: `ServerTokens Prod`

- [ ] **Firewall configured**
  - Only ports 80 (HTTP) and 443 (HTTPS) open
  - Database port restricted to application servers only
  - SSH key-based authentication only

- [ ] **Fail2ban configured** (optional)
  - Ban IPs after repeated failed attempts
  - Protect SSH, HTTP, and database

### Backup & Recovery

- [ ] **Backup strategy implemented**
  - Database: Daily full, hourly incremental
  - Media files: Daily
  - Code: Git repository

- [ ] **Recovery tested**
  - Restore from backup tested successfully
  - Recovery Time Objective (RTO) < 4 hours
  - Recovery Point Objective (RPO) < 1 hour

- [ ] **Disaster recovery plan documented**
  - Step-by-step recovery procedures
  - Contact information for team
  - Vendor/provider contacts

---

## 📝 Documentation & Communication

### Technical Documentation

- [ ] **Deployment guide written**
  - Server setup instructions
  - Environment variable documentation
  - Dependency installation

- [ ] **Architecture documentation**
  - System architecture diagram
  - Database schema
  - API documentation (if applicable)

- [ ] **Runbook created**
  - Common issues and solutions
  - Emergency procedures
  - Escalation paths

### User Documentation

- [ ] **User guide available**
  - Getting started guide
  - Feature documentation
  - FAQ

- [ ] **Admin guide available**
  - Tenant management
  - User management
  - Troubleshooting

### Team Communication

- [ ] **Team notified of deployment**
  - Deployment date/time communicated
  - Expected downtime (if any)
  - Rollback plan communicated

- [ ] **Post-deployment support plan**
  - On-call schedule
  - Support channels
  - Issue escalation process

---

## 🔍 Pre-Launch Review

### Security Review

- [ ] **All critical security issues resolved**
  - Review SECURITY_REPORT.md
  - All CRITICAL issues fixed
  - All HIGH issues fixed or accepted as risk

- [ ] **Penetration test completed** (optional but recommended)
  - External security audit
  - Findings addressed

### Code Review

- [ ] **Code review completed**
  - No hardcoded credentials
  - No commented-out security checks
  - Error handling appropriate
  - Logging doesn't expose sensitive data

### Legal & Compliance

- [ ] **Privacy policy published**
- [ ] **Terms of service published**
- [ ] **Cookie consent implemented** (if in EU)
- [ ] **GDPR compliance reviewed** (if applicable)
- [ ] **Data processing agreement** (if applicable)

---

## 🚨 Known Issues & Accepted Risks

### Test Failures to Investigate

The following security tests have failures that need investigation before production:

#### Tenant Isolation Tests
- [ ] Fix test field name issues (Party `name` field vs actual schema)
- [ ] Verify UnitOfMeasure field names (`abbreviation` vs `code`)
- [ ] Rerun all tenant isolation tests after fixes
- [ ] Ensure all tests pass

#### Schedulizer Endpoint Tests
- [ ] Verify schedulizer URL routes exist and are correct
- [ ] Test authentication requirements on all endpoints
- [ ] Test cross-tenant order access protection
- [ ] Test XSS protection in notes field

#### Middleware Tests
- [ ] Verify TenantContext import path
- [ ] Test tenant middleware behavior without tenant
- [ ] Test tenant header injection protection

### Known Test Issues (Non-Security)

These test failures are due to test code issues, not application vulnerabilities:

1. **Wrong field names in tests**
   - Tests use `abbreviation` field, model uses `code`
   - Tests use `name` field, Party model may use different field
   - **Action:** Update test code to match actual model schema

2. **Missing test fixtures**
   - Some tests need proper test data setup
   - **Action:** Review and fix test setUp methods

3. **Import path issues**
   - Some imports need correction (shared.middleware)
   - **Action:** Fix import paths in test files

### Deferred Items (Post-Launch)

Items that can be addressed after initial launch:

- [ ] Implement full Content-Security-Policy (currently not critical)
- [ ] Add user activity tracking/analytics
- [ ] Implement two-factor authentication
- [ ] Add API rate limiting (if API is exposed)
- [ ] Set up centralized logging (ELK stack or similar)
- [ ] Implement Redis for session storage
- [ ] Add database connection pooling
- [ ] Optimize database queries identified in profiling

---

## ✅ Final Sign-Off

Before deploying to production, the following roles must sign off:

- [ ] **Technical Lead:** Security fixes implemented and verified
- [ ] **QA Lead:** All critical tests passing
- [ ] **Product Owner:** Features complete and acceptable
- [ ] **DevOps Lead:** Infrastructure ready and monitored
- [ ] **Security Officer:** Security review complete (if applicable)

---

## 🔄 Post-Deployment Checklist

Complete within 24 hours of deployment:

- [ ] **Verify production is working**
  - Site accessible at production URL
  - SSL certificate valid
  - Login working
  - Core features functional

- [ ] **Monitor error rates**
  - Check Sentry/error tracking
  - Review server logs
  - No spike in errors

- [ ] **Monitor performance**
  - Response times acceptable
  - No database connection issues
  - No memory leaks

- [ ] **Test tenant isolation in production**
  - Create test tenants
  - Verify data isolation
  - Delete test tenants

- [ ] **Verify backups running**
  - Check first backup completed
  - Verify backup integrity

- [ ] **Team retrospective**
  - What went well?
  - What could be improved?
  - Update runbook/documentation

---

## 📞 Emergency Contacts

- **Technical Lead:** [Name] - [Phone] - [Email]
- **DevOps/Infrastructure:** [Name] - [Phone] - [Email]
- **Database Administrator:** [Name] - [Phone] - [Email]
- **Hosting Provider Support:** [Phone] - [URL]

---

## 🆘 Rollback Procedure

If critical issues are discovered after deployment:

1. **Immediate Actions:**
   - Put up maintenance page
   - Notify team on emergency channel
   - Assess severity and impact

2. **Rollback Steps:**
   ```bash
   # Stop application
   sudo systemctl stop gunicorn

   # Rollback code
   git checkout <previous-stable-tag>

   # Rollback database (if migrations were run)
   python manage.py migrate <app> <previous-migration>

   # Restart application
   sudo systemctl start gunicorn
   ```

3. **Verification:**
   - Site accessible
   - Core features working
   - No data corruption

4. **Post-Rollback:**
   - Incident report
   - Root cause analysis
   - Prevention measures

---

**Last Updated:** 2026-01-10
**Document Version:** 1.0
**Next Review:** Before production deployment
