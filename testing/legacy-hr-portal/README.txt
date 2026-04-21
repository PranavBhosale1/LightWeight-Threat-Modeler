=============================================================
LEGACY HR PORTAL  -  ThreatModeler Step 1 prefill (Legacy flow)
=============================================================

Use this file as the copy/paste source when running the
Lightweight Threat Modeling Tool on the PHP HR Portal demo.

-------------------------------------------------------------
FLOW
-------------------------------------------------------------
Select: Legacy / Production
(Reverse-engineer modules and components from an uploaded ZIP
or pasted repo context.)

-------------------------------------------------------------
SOURCE REPOSITORY
-------------------------------------------------------------
Repository URL:
    https://github.com/corp-internal/legacy-hr-portal

Default branch (optional):
    master

Repository context (paste tree, README, dependencies...):

    legacy-hr-portal/
      ARCHITECTURE.md
      composer.json
      config/settings.ini
      db.php
      index.php
      dashboard.php
      upload.php
      api/employees.php
      cron/export_payroll.php
      uploads/

    Composer dependencies (composer.json):
      php              >=5.6  (running on 7.4 in prod)
      phpmailer/phpmailer  ^5.2
      ext-mysqli, ext-gd

    Summary:
      Internal HR portal. PHP + Apache + MySQL single-host
      monolith. Employees, HR, and a few admins sign in; HR
      manages employee records and payroll. A nightly cron
      exports the full payroll as CSV and emails it to
      finance over plain SMTP. Uploads (profile photos,
      payslips) are written directly under the webroot.
      TLS terminates at the corporate F5 load balancer;
      the app itself speaks plain HTTP.

-------------------------------------------------------------
PROJECT ZIP + NOTES FOR THE MODEL
-------------------------------------------------------------
ZIP to upload:
    testing/legacy-hr-portal.zip
    (create with:  cd testing && zip -r legacy-hr-portal.zip legacy-hr-portal)

Describe the project for the AI:

    This is a legacy internal HR portal running on a single
    VM in the corporate data center. Stack is PHP 7.4 on
    Apache 2.4 with MySQL 5.7 co-located on the same host.
    Users are ~350 employees, ~25 HR staff, and ~5 admins;
    all access is from the office network or corporate VPN.

    The application handles highly sensitive data:
    employee PII (name, address, SSN, DOB), bank account
    details, salary, payslips, and monthly payroll CSV
    exports that are emailed to finance over plain SMTP.

    Trust zones:
      - Internet -> Corporate F5 LB (TLS edge).
      - F5 LB -> Apache host (plaintext HTTP on LAN).
      - Apache/PHP -> MySQL (same host, MySQLi, cleartext).
      - Apache/PHP -> local disk /var/www/hr/uploads.
      - Apache/PHP -> internal Postfix SMTP relay (plain).

    Known/assumed properties the TM should consider:
      - Session auth via PHPSESSID cookie.
      - Passwords are MD5-hashed in the users table.
      - DB/SMTP credentials live in a plaintext .ini file
        under the webroot.
      - SQL is built via string concatenation (mysqli query).
      - An 'admin' flag is honored via ?admin=1 in the URL.
      - Uploads keep the original filename and are written
        directly under /uploads/.
      - No CSRF tokens, no rate limiting, no audit log.

    Priorities for the threat model:
      - Auth, session, and privilege-escalation risks.
      - Injection risks in the search and login paths.
      - Confidentiality of payroll/PII in transit
        (LB<->app, app<->DB, app<->SMTP, app<->disk).
      - Abuse of the nightly CSV export.

-------------------------------------------------------------
APPLICATION METADATA (Step 1 form fields)
-------------------------------------------------------------
Application Name *:
    Legacy HR Portal

Application Type:
    Web Application

Deployment Environment:
    On-premises (corporate data center, single VM)

Application Status:
    Legacy / Production (no prior TM)

Technology Stack:
    PHP 7.4, Apache 2.4 (mod_php), MySQL 5.7,
    PHPMailer 5.x, jQuery 1.8, Bootstrap 3,
    Postfix SMTP relay, F5 load balancer (TLS edge)

Business Criticality:
    High - Mission critical / PII / Financial

Primary Compliance Scope:
    GDPR (EU employee data), SOX (payroll integrity),
    internal HR data handling policy,
    corporate records retention standard

Functional Description:

    Internal HR portal used by employees, HR staff, and a
    small admin group. Employees sign in to view their
    profile, update a profile photo, and download their
    latest payslip. HR staff and managers search and edit
    employee records within their department. Admins create
    users, reset passwords, and trigger payroll exports.

    A nightly cron job dumps the full payroll (including
    name, SSN, department, salary, and bank account) to a
    CSV file under the webroot and emails it as an
    attachment to finance over plain SMTP. The application
    is reachable only from the corporate network or VPN;
    TLS is terminated at the corporate F5 load balancer
    and the app itself serves plain HTTP.


=============================================================
PROJECT DESCRIPTION (plain-text mirror of original README)
=============================================================

Legacy HR Portal
----------------

A circa-2012 internal HR portal used by a mid-size company to
manage employee records, payslips, and performance reviews.
Originally written in PHP 5 on Apache + MySQL, it has been
running in production largely unchanged for years. A small
operations team maintains it; there is no dedicated security
team.

This project exists so we can exercise the threat modeler on
a representative legacy monolithic web application with a
classic LAMP stack.

What the application does
-------------------------
- HR staff log in with a username + password.
- Employees can view their own profile, upload a photo, and
  download their latest payslip PDF.
- Managers can view and edit employees in their department.
- An "admin" flag on the user record unlocks a privileged
  dashboard used to create new employees, reset passwords,
  and run salary exports.
- A nightly cron job emails CSV payroll exports to finance.

Tech stack
----------
- PHP 5.6 (upgraded in-place to 7.4 a few years ago)
- Apache 2.4 with mod_php
- MySQL 5.7 (single instance, running on the same host)
- jQuery 1.8 + Bootstrap 3 on the front-end
- PHPMailer 5.x over plain SMTP to an internal relay
- No container, no CI, deployed via rsync from an
  engineer's laptop

High-level architecture (ASCII)
-------------------------------

        +--------------------+
        |  Employee / HR     |
        |  Web Browser       |
        |  (office LAN + VPN)|
        +---------+----------+
                  |
                  |  HTTPS  (port 443 to corporate LB)
                  v
        +--------------------+
        |  Corporate F5 LB   |
        |  (TLS terminated   |
        |   here)            |
        +---------+----------+
                  |
                  |  HTTP  (port 80 on LAN)
                  v
        +--------------------+           +----------------------+
        |  Apache + mod_php  | --------> |  Local filesystem    |
        |  /var/www/hr       |  read /   |  /var/www/hr/uploads |
        |                    |  write    |  (photos, CSV dumps) |
        +---------+----------+           +----------------------+
                  |
                  |  MySQLi (unencrypted, same host)
                  v
        +--------------------+
        |  MySQL 5.7         |
        |  db: hr_portal     |
        |  tables: users,    |
        |  employees,        |
        |  payslips          |
        +---------+----------+
                  |
                  |  SMTP (plain, port 25)
                  v
        +--------------------+
        |  Internal Postfix  |
        |  mail relay        |
        +--------------------+

See ARCHITECTURE.md for the trust boundaries, data flows,
and asset inventory used for threat modeling.

Directory layout
----------------
legacy-hr-portal/
  ARCHITECTURE.md         # DFD + trust boundaries + assets
  composer.json           # PHPMailer dependency
  config/settings.ini     # DB credentials, SMTP, admin email
  db.php                  # MySQLi connection helper
  index.php               # Login form + session bootstrap
  dashboard.php           # Post-login landing page
  upload.php              # Employee photo upload
  api/employees.php       # Search endpoint used by managers
  cron/export_payroll.php # Nightly CSV export + email
  uploads/                # Photos and payroll dumps

Known compromises (left intentionally)
--------------------------------------
This codebase is a demo target. It intentionally contains
patterns that were common in legacy PHP applications of this
era and that are expected to surface during threat modeling:

- Credentials and SMTP secrets in a plaintext .ini file.
- MD5-hashed passwords.
- String-concatenated SQL queries.
- admin=1 as a URL parameter short-circuit.
- Uploads written directly under the webroot.
- No CSRF tokens, no rate limiting, no audit logging.
- HTTPS is assumed to be handled by the corporate load
  balancer; the app itself speaks plain HTTP.

These are features of the target system, not bugs to fix.
