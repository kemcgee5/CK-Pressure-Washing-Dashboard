// CK Pressure Washing — Stripe webhook. Stripe calls this the moment a
// Checkout session actually completes; this is what marks the job paid,
// NOT the browser redirect back from Stripe (that can be closed, lost, or
// never reloaded, so the real record has to come from Stripe itself).
//
// Env vars required (Vercel project settings -> Environment Variables):
//   STRIPE_SECRET_KEY      — same key used in api/checkout.js
//   STRIPE_WEBHOOK_SECRET  — from the webhook's settings in your Stripe dashboard
//   CK_WEBHOOK_SECRET      — a random string you chose yourself; must match
//                            the WEBHOOK_SECRET_HERE value you put in
//                            round-9-stripe-payments.sql
//   SUPABASE_URL / SUPABASE_ANON_KEY — same values baked into index.html
//
// Needs the RAW request body to verify Stripe's signature, so body parsing
// is turned off below — do not remove that `config` export.

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

function readRawBody(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end('Method not allowed');
    return;
  }

  let event;
  try {
    const sig = req.headers['stripe-signature'];
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send('Webhook Error: ' + err.message);
    return;
  }

  // Both events fire on a successful payment — cards complete immediately
  // (checkout.session.completed); bank-debit methods can take a few days to
  // actually clear, which is when async_payment_succeeded fires instead.
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    const token = session.metadata && session.metadata.ck_token;
    if (token) {
      try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { error } = await supabase.rpc('record_stripe_payment', {
          p_token: token,
          p_session_id: session.id,
          p_secret: process.env.CK_WEBHOOK_SECRET,
        });
        if (error) console.error('record_stripe_payment failed:', error.message);
      } catch (err) {
        console.error('Error recording payment:', err);
      }
    } else {
      console.error('Webhook session had no ck_token in metadata:', session.id);
    }
  }

  // Acknowledge receipt either way once the signature checks out — Stripe
  // will keep retrying a non-2xx response, which won't fix a logic error
  // above; those show up in Vercel's function logs instead.
  res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
