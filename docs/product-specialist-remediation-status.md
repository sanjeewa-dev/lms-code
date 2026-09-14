# Product specialist audit — remediation status

**Updated:** 2026-08-15  
**Repos:** Mindspark and Learn Smart LMS

Source audit: Smart LMS `docs/product-specialist-audit.md`.

## Fixed in both projects

| ID | Fix |
|----|-----|
| P02 | Class-join CTA requires sign-in when unauthenticated; login honors `?next=` |
| P03 | Registration no longer auto-selects first class |
| P07 | Expired quiz attempt no longer offers Submit |
| P08 | Students can open assignment briefs |
| P09 | Roster remove deletes enrollment only (keeps account) |
| P10 | Student directory APIs/UI admin-only |
| P11 | Quiz purge requires typing `DELETE` |
| P14 | `trust proxy` enabled in production / `TRUST_PROXY=true` |
| P16 | SMTP-off mode no longer logs email bodies/tokens |
| P18 | Partial unique index + typed duplicate checks + `P2002` → 409 |
| P22 | Recurring schedule create shows created-count notice |
| P25 | PayHere IPN validates pending payment amount (waivers) |
| P26 | Rejecting a student revokes refresh tokens |
| P27 | AI attachments limited to text/Markdown/CSV/PDF |

## Notes

- **P04:** PayHere “Pay online” available in both frontends when enabled.
- **P30 (Mindspark):** pending-until-approval enrollment docs match the payment gate; do not rewrite as activate-then-prior-month.

## Still open

P01 · P05 · P06 · P12 · P13 · P15 · P17 · P19 · P20 · P21 · P23 · P24 · P28 · P29
