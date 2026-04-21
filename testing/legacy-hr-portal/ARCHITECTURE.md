# Architecture & Threat Model Scope — Legacy HR Portal

## Purpose

This document describes the system boundary, data flows, and assets for the
Legacy HR Portal so that the Lightweight Threat Modeler has a clear scope
when generating STRIDE threats.

## System context

- **Deployment model:** single VM in the corporate data center. Apache +
  PHP + MySQL co-located on one host (`hr01.corp.internal`).
- **Users:** ~350 employees, ~25 HR staff, ~5 admins. All access is from
  inside the corporate network or via corporate VPN.
- **Edge:** TLS terminates at the corporate F5 load balancer. Traffic
  between the LB and the Apache host is plain HTTP on port 80.

## Data Flow Diagram (logical)

```
 ┌────────────────┐   (1) HTTPS  ┌──────────────┐   (2) HTTP   ┌──────────────────┐
 │  Browser       │ ───────────▶ │  Corporate   │ ───────────▶ │  Apache/PHP      │
 │  (employee/HR) │              │  F5 LB       │              │  HR Portal app   │
 └────────────────┘              └──────────────┘              └────────┬─────────┘
                                                                        │
                                        (3) MySQLi, cleartext, same host│
                                                                        ▼
                                                               ┌──────────────────┐
                                                               │  MySQL 5.7       │
                                                               │  hr_portal DB    │
                                                               └──────────────────┘
                                                                        │
                                                   (4) file I/O         │
                                                                        ▼
                                                               ┌──────────────────┐
                                                               │  /var/www/hr/    │
                                                               │  uploads/        │
                                                               └──────────────────┘
                                                                        │
                                       (5) SMTP, plain, port 25         │
                                                                        ▼
                                                               ┌──────────────────┐
                                                               │  Internal        │
                                                               │  Postfix relay   │
                                                               └──────────────────┘
```

## Trust boundaries

- **TB-1** Internet ↔ Corporate LB (TLS terminated here).
- **TB-2** Corporate LB ↔ Apache host (plaintext, *assumed* trusted LAN).
- **TB-3** Apache/PHP process ↔ MySQL (same host, Unix user `www-data`).
- **TB-4** Apache/PHP process ↔ local filesystem (`uploads/`, `config/`).
- **TB-5** Apache/PHP process ↔ internal SMTP relay.

## Assets

| ID   | Asset                                  | Sensitivity |
|------|----------------------------------------|-------------|
| A-1  | Employee PII (name, address, SSN, DOB) | High        |
| A-2  | Salary and payslip records             | High        |
| A-3  | Login credentials (MD5 hashed)         | High        |
| A-4  | Session cookies (`PHPSESSID`)          | Medium      |
| A-5  | Uploaded employee photos               | Low         |
| A-6  | Nightly payroll CSV export             | High        |
| A-7  | DB/SMTP credentials in `settings.ini`  | High        |

## Elements for STRIDE

### Processes
- `P1` Apache + PHP application (`index.php`, `dashboard.php`, `upload.php`, `api/employees.php`)
- `P2` Nightly payroll export cron job (`cron/export_payroll.php`)

### Data stores
- `DS1` MySQL `hr_portal` database
- `DS2` `uploads/` directory on local disk
- `DS3` `config/settings.ini`

### External entities
- `E1` Employee / HR / Admin browser
- `E2` Corporate F5 load balancer
- `E3` Internal Postfix SMTP relay

### Data flows
- `F1` Browser → LB (HTTPS)
- `F2` LB → PHP app (HTTP)
- `F3` PHP app ↔ MySQL (MySQLi, cleartext)
- `F4` PHP app ↔ `uploads/` on disk
- `F5` PHP app → SMTP relay (plain SMTP)

## Out of scope

- The F5 LB configuration.
- The corporate VPN and AD directory.
- The host operating system and its patch level.
- The Postfix relay itself (only the outbound flow from the app is modeled).
