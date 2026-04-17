import { Resend } from 'resend';

const {
  ECWID_STORE_ID,
  ECWID_TOKEN,
  RESEND_API_KEY,
  NOTIFY_FROM,
  NOTIFY_TO,
} = process.env;

const resend = new Resend(RESEND_API_KEY);

export default async function handler(req, res) {
  // Healthcheck (GET) — pour tester que la route répond
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body || {};
    const eventType = payload.eventType;
    const orderId = payload.entityId;

    // On réagit seulement aux events de commande
    if (!eventType || !eventType.startsWith('order.')) {
      return res.status(200).json({ ok: true, skipped: 'not an order event' });
    }

    if (!orderId) {
      return res.status(200).json({ ok: true, skipped: 'no entityId' });
    }

    // Fetch la commande complète via l'API Ecwid
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

    // On n'envoie l'email QUE pour les commandes payées / en traitement
    // pour éviter de recevoir un mail à chaque changement mineur
    const paymentStatus = order.paymentStatus;
    const fulfillmentStatus = order.fulfillmentStatus;
    const shouldNotify =
      paymentStatus === 'PAID' &&
      (fulfillmentStatus === 'AWAITING_PROCESSING' ||
       fulfillmentStatus === 'PROCESSING' ||
       fulfillmentStatus === 'NEW');

    if (!shouldNotify) {
      return res.status(200).json({
        ok: true,
        skipped: `payment=${paymentStatus} fulfillment=${fulfillmentStatus}`,
      });
    }

    // Anti-doublon simple : on envoie seulement sur order.created,
    // ou sur order.updated si c'est la 1re fois qu'on atteint PAID+PROCESSING
    // Pour 1-2 commandes/jour c'est acceptable de rester simple et accepter
    // qu'un même order puisse générer 2 mails en cas d'update d'état.
    // On ajoute le statut dans le sujet pour que tu puisses les distinguer.

    const emailHtml = buildPickingEmail(order);
    const subject = `🎤 Commande #${order.vendorOrderNumber || order.id} à préparer`;

    await resend.emails.send({
      from: NOTIFY_FROM,
      to: NOTIFY_TO,
      subject,
      html: emailHtml,
    });

    return res.status(200).json({ ok: true, orderId, sent: true });
  } catch (err) {
    console.error('Webhook handler error', err);
    // On retourne 200 même en cas d'erreur pour qu'Ecwid ne retry pas en boucle
    return res.status(200).json({ ok: false, error: String(err) });
  }
}

// ---------- Template email picking ----------

function buildPickingEmail(order) {
  const orderNum = order.vendorOrderNumber || order.id;
  const date = new Date(order.createDate || Date.now()).toLocaleString('fr-CA', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const s = order.shippingPerson || {};
  const shipTo = [
    s.name,
    s.street,
    [s.city, s.stateOrProvinceCode, s.postalCode].filter(Boolean).join(' '),
    s.countryName,
  ].filter(Boolean).join(', ');

  const shippingMethod = order.shippingOption?.shippingMethodName || '—';
  const paymentMethod = order.paymentMethod || '—';
  const orderComments = order.orderComments || '';

  // Items à picker
  const itemsHtml = (order.items || []).map((item) => {
    const qty = item.quantity || 1;
    const name = escapeHtml(item.name || 'Item');
    const sku = escapeHtml(item.sku || '');

    // Filtrer les selectedOptions "None"
    const opts = (item.selectedOptions || []).filter((opt) => {
      const v = String(opt.value || '').trim();
      return v && v.toLowerCase() !== 'none';
    });

    const optsHtml = opts.length
      ? `<ul style="margin:6px 0 0 24px; padding:0; color:#444;">
           ${opts.map((o) => `<li style="margin:2px 0;">${escapeHtml(o.name)}: <strong>${escapeHtml(o.value)}</strong></li>`).join('')}
         </ul>`
      : '';

    return `
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid #eee; vertical-align:top;">
          <input type="checkbox" style="margin-right:8px;"> 
          <span style="font-size:16px;"><strong>${qty}×</strong> ${name}</span>
          <div style="font-size:12px; color:#888; margin-left:24px;">SKU: ${sku || '—'}</div>
          ${optsHtml}
        </td>
      </tr>
    `;
  }).join('');

  const itemsTotal = Number(order.subtotal || 0).toFixed(2);
  const shipCost = Number(order.shippingOption?.shippingRate || 0).toFixed(2);
  const total = Number(order.total || 0).toFixed(2);
  const currency = order.currency || 'USD';

  return `
<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width:640px; margin:0 auto; padding:20px; color:#222;">
  <div style="border-bottom:2px solid #0a0806; padding-bottom:12px; margin-bottom:16px;">
    <h1 style="margin:0; font-size:22px;">🎤 Commande #${escapeHtml(String(orderNum))}</h1>
    <div style="color:#666; font-size:13px; margin-top:4px;">${escapeHtml(date)}</div>
  </div>

  <table style="width:100%; font-size:14px; margin-bottom:20px;">
    <tr>
      <td style="padding:4px 8px 4px 0; color:#888; width:90px;">Client</td>
      <td style="padding:4px 0;"><strong>${escapeHtml(s.name || '—')}</strong></td>
    </tr>
    <tr>
      <td style="padding:4px 8px 4px 0; color:#888; vertical-align:top;">Ship to</td>
      <td style="padding:4px 0;">${escapeHtml(shipTo || '—')}</td>
    </tr>
    <tr>
      <td style="padding:4px 8px 4px 0; color:#888;">Via</td>
      <td style="padding:4px 0;">${escapeHtml(shippingMethod)}</td>
    </tr>
    <tr>
      <td style="padding:4px 8px 4px 0; color:#888;">Paiement</td>
      <td style="padding:4px 0;">${escapeHtml(paymentMethod)}</td>
    </tr>
    ${orderComments ? `
    <tr>
      <td style="padding:4px 8px 4px 0; color:#888; vertical-align:top;">Note</td>
      <td style="padding:4px 0; font-style:italic; color:#c8a86a;">${escapeHtml(orderComments)}</td>
    </tr>` : ''}
  </table>

  <h2 style="font-size:16px; border-bottom:1px solid #ccc; padding-bottom:6px; margin-bottom:0;">À PICKER</h2>
  <table style="width:100%; border-collapse:collapse;">
    ${itemsHtml}
  </table>

  <div style="margin-top:20px; padding-top:12px; border-top:2px solid #0a0806; font-size:14px;">
    <div style="display:flex; justify-content:space-between;">
      <span>Items</span><span>$${itemsTotal} ${currency}</span>
    </div>
    <div style="display:flex; justify-content:space-between;">
      <span>Shipping</span><span>$${shipCost} ${currency}</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-weight:bold; margin-top:4px;">
      <span>Total</span><span>$${total} ${currency}</span>
    </div>
  </div>
</body>
</html>
  `;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}