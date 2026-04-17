import { Resend } from 'resend';
import { buildPickingEmail } from './_email-template.js';
import { buildPickingPdf } from './_pdf-template.js';

const { ECWID_STORE_ID, ECWID_TOKEN, RESEND_API_KEY, NOTIFY_FROM, NOTIFY_TO } = process.env;
const resend = new Resend(RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body || {};
    const eventType = payload.eventType;
    const orderId = payload.entityId;

    if (!eventType || !eventType.startsWith('order.')) {
      return res.status(200).json({ ok: true, skipped: 'not an order event' });
    }
    if (!orderId) return res.status(200).json({ ok: true, skipped: 'no entityId' });

    const orderUrl = `https://app.ecwid.com/api/v3/${ECWID_STORE_ID}/orders/${orderId}`;
    const ecwidRes = await fetch(orderUrl, {
      headers: { Authorization: `Bearer ${ECWID_TOKEN}` },
    });
    if (!ecwidRes.ok) {
      const errText = await ecwidRes.text();
      console.error('Ecwid fetch failed', ecwidRes.status, errText);
      return res.status(200).json({ ok: false, error: 'ecwid fetch failed' });
    }

    const order = await ecwidRes.json();
    const paymentStatus = order.paymentStatus;
    const fulfillmentStatus = order.fulfillmentStatus;
    const shouldNotify =
      paymentStatus === 'PAID' &&
      ['AWAITING_PROCESSING', 'PROCESSING', 'NEW'].includes(fulfillmentStatus);

    if (!shouldNotify) {
      return res.status(200).json({
        ok: true,
        skipped: `payment=${paymentStatus} fulfillment=${fulfillmentStatus}`,
      });
    }

    const orderNum = order.vendorOrderNumber || order.id;
    const emailHtml = buildPickingEmail(order);
    const pdfBuffer = await buildPickingPdf(order);
    const subject = `🎤 Commande #${orderNum} à préparer`;

    const sendResult = await resend.emails.send({
      from: NOTIFY_FROM,
      to: NOTIFY_TO,
      subject,
      html: emailHtml,
      attachments: [
        {
          filename: `picking-${orderNum}.pdf`,
          content: pdfBuffer.toString('base64'),
        },
      ],
    });

    if (sendResult.error) {
      console.error('Resend error', sendResult.error);
      return res.status(200).json({ ok: false, orderId, resendError: sendResult.error });
    }
    return res.status(200).json({ ok: true, orderId, sent: true, resendId: sendResult.data?.id });
  } catch (err) {
    console.error('Webhook handler error', err);
    return res.status(200).json({ ok: false, error: String(err) });
  }
}