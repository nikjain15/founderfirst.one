<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Penny demo. `posthog-js` was installed and initialized via a new `analytics.js` module imported at app startup (`main.jsx`). PostHog is configured with exception autocapture enabled and `capture_pageview: false` (pageviews are not meaningful in this single-page hash-routed demo). Environment variables `VITE_PUBLIC_POSTHOG_KEY` and `VITE_PUBLIC_POSTHOG_HOST` are stored in `.env`. Fifteen business-critical events were added across five screens, covering the full user lifecycle: onboarding funnel, transaction engagement, receipt capture modes, integration connections, financial Q&A, and data import/export. User identification fires at two points — after onboarding completes (with entity type and industry) and after the intro conversation in the Penny thread (when first name and business name are known).

| Event | Description | File |
|---|---|---|
| `entity_type_selected` | User selects their business entity type during onboarding (sole-prop, llc, s-corp, c-corp, or resolved via diagnostic) | `screens/onboarding.jsx` |
| `industry_selected` | User selects their industry during onboarding | `screens/onboarding.jsx` |
| `bank_connected` | User connects a bank during onboarding | `screens/onboarding.jsx` |
| `onboarding_completed` | User finishes the full onboarding flow; fires `posthog.identify()` with entity and industry | `screens/onboarding.jsx` |
| `transaction_approved` | User confirms a transaction on an approval card (vendor, amount, category, confidence, variant) | `screens/card.jsx` |
| `transaction_skipped` | User taps "Skip for now" on an approval card | `screens/card.jsx` |
| `transaction_category_changed` | User changes the AI-suggested category on a card | `screens/card.jsx` |
| `receipt_captured_photo` | User captures a receipt via the camera | `screens/add.jsx` |
| `receipt_captured_voice` | User records a voice note | `screens/add.jsx` |
| `receipt_captured_text` | User submits a free-text description via "Just tell me" | `screens/add.jsx` |
| `account_connected` | User connects a bank, payment provider, or payroll integration (provider name, type) | `screens/add.jsx` |
| `email_connected` | User connects Gmail or Outlook for receipt ingestion | `screens/add.jsx` |
| `data_imported` | User completes a CSV/file import (transaction count) | `screens/add.jsx` |
| `data_exported` | User downloads an export in a chosen format (csv, qbo, pdf) | `screens/add.jsx` |
| `books_question_asked` | User submits a question to Penny via the Ask Penny bar in My Books | `screens/books.jsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://us.posthog.com/project/394556/dashboard/1503176
- **Onboarding completion funnel** (entity selected → industry selected → onboarding completed): https://us.posthog.com/project/394556/insights/M4l2AGL5
- **Transaction approval vs skip rate** (weekly approved vs skipped trend): https://us.posthog.com/project/394556/insights/G4uXmMS6
- **Capture method usage** (photo vs voice vs free-text bar chart): https://us.posthog.com/project/394556/insights/dZ255FkN
- **New activations — onboarding completed** (weekly unique activations): https://us.posthog.com/project/394556/insights/B7ZhzLKD
- **Integration connections** (bank, account, email connections over time): https://us.posthog.com/project/394556/insights/onnCOB83

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-javascript_node/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
