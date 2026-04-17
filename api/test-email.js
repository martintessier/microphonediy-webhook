import { Resend } from 'resend';
import { buildPickingEmail } from './_email-template.js';

const { ECWID_STORE_ID, ECWID_TOKEN, RESEND_API_KEY, NOTIFY_FROM, NOTIFY_TO } = process.env;
const resend = new Resend(RESEND_API_KEY);

export default async function handler(req, res) {
  const orderId = req.query.orderId || 'WHKSA';

  try {
    const orderUrl = `https://app.ecwid.com/api/v3/${ECWID_STORE_ID}/orders/${orderId}`;
    const ecwidRes = await fetch(orderUrl, {
      headers: { Authorization: `Bearer ${ECWID_TOKEN}` },
    });
    if (!ecwidRes.ok) {
      const errText = await ecwidRes.text();
      return res.status(500).json({ error: 'ecwid fetch failed', detail: errText });
    }

    const order = await ecwidRes.json();
    const emailHtml = buildPickingEmail(order);
    const subject = `🎤 [TEST] Commande #${order.vendorOrderNumber || order.id}`;

    const result = await resend.emails.send({
      from: NOTIFY_FROM, to: NOTIFY_TO, subject, html: emailHtml,
    });
    return res.status(200).json({
      ok: true,
      orderId,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      resendId: result.data?.id,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}