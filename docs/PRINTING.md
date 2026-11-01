# Print preparation, production orders and workshop profiles

This document describes the Phase 8 business and printing marketplace: how a saved
design becomes production artwork, how an order moves through production, and what
this build deliberately does **not** do.

The single most important rule: **print files are production artwork, not AI
previews.** No try-on result, generated image or 3D screenshot is ever stored as a
print file. `PrintPackage.is_ai_preview` is always `false`, and the print endpoints
never read `try_on_sessions` or `media_assets.kind = try_on`.

---

## 1. What the customer gets

| Capability | Where | Notes |
|---|---|---|
| Print area in cm | `POST /print/packages` | 5–150 cm wide, 5–200 cm tall per package; per-component overrides |
| DPI checking | package report + per-file warnings | Effective DPI is computed from **pixel width at the target physical width**; files are never upscaled |
| Colour profile information | per-file `color_space` + `color_profile` | Embedded ICC descriptions are read; optional conversion to sRGB via Pillow/ImageCms |
| Transparent background | per-file `has_transparency`, PDF `SMask` | Alpha survives PNG and PDF export |
| Component-specific files | `print_files` table, one row per component | Each row links its own PNG asset and carries its own size/DPI report |
| PNG/PDF export | `GET /print/packages/{id}/download?format=pdf|zip` | PDF is generated locally, exact physical size; ZIP contains PNGs + `manifest.json` |
| Preview and approval | draft → in review → approved / changes requested | Only the owner can edit, submit, approve or send back |
| Bleed | 0–20 mm | Added around the page in the PDF; recorded in the manifest |

Print packages can only be attached to an order once they are **approved**.
Attaching approved artwork to an order at the `quote_approved` stage advances the
order to `design_approved`.

### File sources

For every selected component:

1. **Uploaded print artwork** (`print_asset_id` on the design component, uploaded
   with `kind=print`) is used untouched. Transparency is preserved.
2. **Solid colour fill** is generated at the exact target pixel size from the
   design component colour. The report says so explicitly (`source:
   solid_colour`); it is not presented as scanned artwork.
3. Anything else is **skipped**, with the reason recorded in `manifest.skipped`
   (`No print artwork or colour set on this component.`).

If no component is printable the request fails with `422
no_printable_components` rather than producing an empty package.

### DPI rules

```
effective_dpi = round(pixel_width / (target_width_cm / 2.54))
dpi_ok        = effective_dpi >= requested_dpi
```

* Allowed request range: 150–600 DPI; 300 DPI is recommended.
* A file below target is kept at its real resolution and flagged. It is **not**
  interpolated to pretend it meets the target.
* Aspect-ratio mismatches are reported. The PDF fills the exact print panel, so
  the warning tells the customer to preview the distortion.

### PDF implementation

No PDF library is installed, so the export is a small, real PDF 1.4 writer in
`backend/app/services/print_jobs.py`:

* one page per component, `/MediaBox` sized in points at 100 % scale
  (`cm / 2.54 * 72`) plus bleed and an 18 pt production footer;
* images embedded as `/DeviceRGB`, 8 bits per component, Flate-compressed;
* alpha embedded as a `/DeviceGray` **`/SMask`**, so transparency is preserved;
* base-14 `/Helvetica` footer with component name, target size, effective DPI,
  colour mode and the instruction “print at 100% — do not fit to page”;
* a valid xref table and trailer. Tests resolve every xref offset back to its
  object and assert the page geometry.

The ZIP additionally carries `README.txt` and `manifest.json`. The manifest
records every file, its pixel size, physical size, effective DPI, colour profile,
warnings, skipped components and `printer_connection: "none"`.

### Colour

* `color_profile: "srgb"` converts an embedded profile to sRGB with
  `ImageCms.profileToProfile` (relative colorimetric) and records the conversion.
* `color_profile: "source"` leaves pixels and the embedded profile untouched.
* There is **no CMYK press profile, soft proof, ink-limit, spot-colour or
  overprint handling**. The report says “colour unmanaged” when no profile exists
  and does not claim press accuracy.

---

## 2. Production workflow

Ten explicit states, stored in `quote_requests.production_status` (separate from
the older quote lifecycle in `quote_requests.status`):

```
order_received → quote_pending → quote_approved → design_approved
→ production_pending → printing_in_progress → quality_checking
→ ready_for_delivery → completed
```

`cancelled` is reachable from any non-terminal state. A failed inspection can
loop `quality_checking → printing_in_progress` for a reprint.

| Transition | Allowed actor |
|---|---|
| `order_received → quote_pending` | workshop (sending a quote) |
| `quote_pending → quote_approved` | customer (accepting a quote) |
| `quote_approved → design_approved` | customer (approving artwork) |
| `design_approved → production_pending` | workshop |
| `production_pending → printing_in_progress` | workshop |
| `printing_in_progress → quality_checking` | workshop |
| `quality_checking → ready_for_delivery` | workshop |
| `quality_checking → printing_in_progress` | workshop (reprint) |
| `ready_for_delivery → completed` | customer |
| any active state → `cancelled` | customer or workshop |
| `completed → *` | nobody |

Every change writes an immutable `order_events` row with the actor, previous
state, next state, optional note and timestamp. `GET
/marketplace/requests/{id}/transitions` tells the UI exactly what the current user
may do; the API enforces the same rules again, so a client cannot set an
arbitrary status.

Accepting a quote sets `agreed_amount_cents`/`agreed_currency`, declines other
open quotes and moves the order to `quote_approved` (or straight to
`design_approved` when an approved print package is already attached).

---

## 3. Business profiles

`businesses` now carries a tagline, street address, postal code, response time,
minimum order and lead time, plus `rating`/`review_count`. Child tables:

* `business_offerings` — services **and** products with `kind`, `pricing_mode`
  (`fixed`, `from`, `per_unit`, `quote`), price, currency, unit, minimum
  quantity, lead time, active flag and sort order. Non-quote pricing requires a
  price.
* `business_service_areas` — city/country, radius in km, remote flag, notes.
* `business_portfolio_items` — title, description, optional image asset.
* `business_reviews` — one review per completed order (`UNIQUE(order_id)`),
  rating 1–5, title, body, one optional studio reply.

Portfolio images are uploaded to private media storage and exposed only through
`GET /marketplace/portfolio/{item_id}/image`, which serves images for **active**
businesses. The raw `/media/{asset_id}/content` endpoint remains owner-only.

Reviews require the customer's own order in `completed`; posting one recomputes
the business rating and review count. Only the business owner can reply.

---

## 4. API surface

| Method | Path | Access |
|---|---|---|
| GET | `/print/capabilities` | public |
| POST | `/print/packages` | owner |
| GET | `/print/packages?scope=mine\|shared` | owner / workshop with an attached order |
| GET | `/print/packages/{id}` | owner, linked workshop, admin |
| POST | `/print/packages/{id}/rebuild` | owner, editable states only |
| POST | `/print/packages/{id}/submit` | owner |
| POST | `/print/packages/{id}/approve` | owner |
| POST | `/print/packages/{id}/request-changes` | owner (`reason` required) |
| POST | `/print/packages/{id}/export` | owner or linked workshop |
| GET | `/print/packages/{id}/download?format=pdf\|zip` | owner or linked workshop |
| GET | `/print/packages/{id}/files/{file_id}[?preview=true]` | owner or linked workshop |
| GET/PUT | `/marketplace/businesses/mine`, `/marketplace/businesses/{id}` | owner |
| POST/PUT/DELETE | offerings, service areas, portfolio | business owner |
| GET | `/marketplace/businesses/{slug}` | public (includes offerings, areas, portfolio, 20 newest reviews) |
| GET | `/marketplace/businesses/{slug}/reviews` | public |
| GET | `/marketplace/requests/{id}/transitions` | order participants |
| POST | `/marketplace/requests/{id}/production-status` | per transition table |
| POST | `/marketplace/requests/{id}/print-package` | customer |
| POST | `/marketplace/requests/{id}/reviews` | customer, completed order only |
| POST | `/marketplace/reviews/{id}/reply` | business owner |

Media kinds `print_file`, `print_package` and `portfolio` are deliberately
separate from `try_on`, `export` and `preview` imagery. `print_package` cannot be
uploaded through `/media/upload`; those assets are server-generated only.

---

## 5. Printer integration — status

**Manual export/import only.** There is no printer, RIP, driver or vendor-cloud
connection in this codebase, and the API says so in `/print/capabilities`
(`printer_connection: false`, `printer_integrations: []`,
`integration_mode: "manual_export_import"`).

An integration will only be added when all of the following exist and can be
tested end to end:

1. the actual protocol or vendor API (EFI/Roland/Mimaki/HP etc., or a RIP hot
   folder contract) and its licence;
2. a real device or vendor sandbox reachable from CI;
3. a verified contract test for colour, scaling, bleed, imposition and error
   states.

Until then the UI and docs must not imply that “Send to printer” works. Files are
downloaded and handed to the print operator for RIP setup.

---

## 6. Known limitations

* No ICC output profile per press, soft proofing, ink limits, spot colours,
  overprint or trapping.
* No imposition, nesting, step-and-repeat or roll-width optimisation.
* No preflight against a specific RIP's rules.
* No payment processing; quotes are agreed amounts only.
* No shipping integration; delivery is arranged between customer and workshop.
* Solid-colour components are generated fills, labelled as such — not scans.
* Arabic/Urdu text in the PDF footer is not supported by the base-14 font; the
  footer is Latin-1 and the artwork itself is unaffected.

---

## 7. Tests

* `backend/tests/test_print_packages.py` — package build, DPI honesty, PDF
  structure/xref/SMask/page geometry, ZIP contents, approval workflow, access
  control, blocked upload kind.
* `backend/tests/test_marketplace_phase8.py` — profile/offerings/areas/portfolio,
  owner-only editing, full ten-stage order flow, transition rejection, reviews and
  ratings, shared package access, cancellation.
* `frontend/src/pages/marketplace.test.tsx` — directory, studio page, order
  production badge, print package DPI report/approval, business dashboard.
