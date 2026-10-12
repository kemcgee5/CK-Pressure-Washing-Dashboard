// CK Pressure Washing — creates a Stripe Checkout session for one invoice.
// Called from the public estimate/invoice page (index.html) when a client
// clicks "Pay Here". Never trusts a client-supplied dollar amount — it looks
// the job up by its public token (same narrow RPC the invoice page itself
// uses) and recomputes the balance due from the job's own line items.
//
// Env vars required (Vercel project settings -> Environment Variables):
//   STRIPE_SECRET_KEY   — from your Stripe dashboard (Developers -> API keys)
//   SUPABASE_URL        — same value baked into index.html
//   SUPABASE_ANON_KEY   — same value baked into index.html

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Vercel env values pasted with a stray space, newline or quotes break auth headers.
function env(name){ return String(process.env[name] || '').trim().replace(/^["']+|["']+$/g, ''); }

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const token = body.token;
    if (!token) {
      res.status(400).json({ error: 'Missing token.' });
      return;
    }

    if (!env('STRIPE_SECRET_KEY') || !env('SUPABASE_URL') || !env('SUPABASE_ANON_KEY')) {
      res.status(500).json({ error: 'Payments are not configured on the server yet.' });
      return;
    }

    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'));
    const { data: job, error } = await supabase.rpc('get_estimate_by_token', { p_token: token });
    if (error || !job) {
      res.status(404).json({ error: "This invoice link isn't valid." });
      return;
    }

    const profile = job.profile || {};
    if (!profile.accept_online_payments) {
      res.status(400).json({ error: 'Online card payments are not turned on yet. Please use one of the other payment options shown.' });
      return;
    }

    // Same math as the dashboard's amountReceived()/jobBalanceDue() — kept in
    // sync by hand since this runs server-side, outside the browser bundle.
    const subtotal = (job.line_items || []).reduce(
      (sum, li) => sum + Number(li.quantity) * Number(li.unit_price), 0
    );
    const total = subtotal * (1 + (Number(job.tax_rate) || 0) / 100);
    let received = 0;
    if (job.status === 'paid') {
      received = (job.amount_paid != null && job.amount_paid !== '') ? Number(job.amount_paid) : total;
    } else if (job.status === 'completed') {
      received = Number(job.amount_paid || 0);
    }
    const balance = Math.round((total - received) * 100) / 100;
    if (!(balance > 0)) {
      res.status(400).json({ error: 'There is no balance due on this invoice.' });
      return;
    }

    const balanceCents = Math.round(balance * 100);
    // Card fee pass-through: when turned on, add exactly enough that after
    // Stripe takes its standard fee (2.9% + 30 cents) the business nets the
    // full balance. gross = (balance + 0.30) / (1 - 0.029); the fee is the
    // difference, rounded UP to the next cent so it can never fall short.
    const feeOn = (Number(profile.online_payment_fee_pct) || 0) > 0;
    const STRIPE_PCT = 0.029, STRIPE_FIXED_CENTS = 30;
    const feeCents = feeOn
      ? Math.ceil((balanceCents + STRIPE_FIXED_CENTS) / (1 - STRIPE_PCT)) - balanceCents
      : 0;

    const stripe = new Stripe(env('STRIPE_SECRET_KEY'));
    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'Invoice #' + job.id + ' — ' + (profile.business_name || 'Payment') },
        unit_amount: balanceCents,
      },
      quantity: 1,
    }];
    if (feeCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Card processing fee' },
          unit_amount: feeCents,
        },
        quantity: 1,
      });
    }

    const origin = req.headers.origin || ('https://' + req.headers.host);
    const returnUrl = origin + '/?estimate=' + encodeURIComponent(token);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: returnUrl + '&paid=1',
      cancel_url: returnUrl,
      metadata: { ck_token: token, ck_job_id: String(job.id) },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('checkout.js error:', err);
    if (err && err.detail) console.error('checkout.js cause:', err.detail.message || err.detail);
    var k = env('STRIPE_SECRET_KEY');
    console.error('checkout.js key shape:', k.slice(0, 8) + '… length ' + k.length + (/\s/.test(k) ? ' (contains whitespace)' : ''));
    res.status(500).json({ error: 'Could not start checkout. Please try again or use another payment option.' });
  }
};