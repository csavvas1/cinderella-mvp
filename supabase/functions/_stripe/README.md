# Beds24 billing — setup checklist

Everything here is **Stripe TEST mode** until Adrien confirms the Beds24 account
model (B1 single-account vs B2 account-per-client). No real charges yet.

## 1. Apply the DB migration
Supabase → SQL Editor:
1. Run `supabase/beds24_billing.sql`
2. Run `.claude/scripts/cinderella_verify_beds24_billing.sql` → all rows must say `PASS`

## 2. Create a Stripe account (test mode)
- Sign up at https://stripe.com, stay in **Test mode** (toggle top-right).
- Copy **Secret key** (`sk_test_…`) and **Publishable key** (`pk_test_…`).

## 3. Create 3 products (Test mode → Product catalog)
| Product | Price | Type | Env var for the price id |
|---------|-------|------|--------------------------|
| Cinderella Pro | €12.99 / month | recurring | `STRIPE_PRICE_PRO` |
| Property Connection | €14.99 / month | recurring (quantity-based) | `STRIPE_PRICE_PROPERTY` |
| Activation Fee | €12.90 one-time | one-time | `STRIPE_PRICE_ACTIVATION` |

Copy each **price id** (`price_…`).

> Activation Fee = the Beds24 €12.90 base pass-through. Only charged when
> `CHARGE_BASE_FEE=true`. Leave it **false** until Adrien confirms B2. Under B1
> the base is our one-off cost, not the client's.

## 4. Set Supabase function secrets
Dashboard → Project → Edge Functions → Secrets (or `supabase secrets set`):

```
BEDS24_REFRESH_TOKEN=<the refresh token from secrets\beds24_runtime_token.txt>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...        # from step 6
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_PROPERTY=price_...
STRIPE_PRICE_ACTIVATION=price_...
CHARGE_BASE_FEE=false
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

## 5. Deploy functions
```
supabase functions deploy stripe-checkout stripe-webhook \
  connect-property disconnect-property beds24-poll
```

## 6. Register the Stripe webhook
- Stripe dashboard → Developers → Webhooks → Add endpoint
- URL: `https://<project-ref>.functions.supabase.co/stripe-webhook`
- Events: `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`, `invoice.payment_failed`
- Copy the signing secret (`whsec_…`) → set `STRIPE_WEBHOOK_SECRET` (step 4) → redeploy.

## 7. Schedule the poller
Supabase → Database → Cron (pg_cron) or the dashboard scheduler:
```sql
select cron.schedule('beds24-poll-hourly', '7 * * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/beds24-poll',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
  );
$$);
```

## 8. Frontend env (`.env`)
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Test card
`4242 4242 4242 4242`, any future expiry, any CVC.
