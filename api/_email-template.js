export function buildPickingEmail(order) {
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

  const itemsHtml = (order.items || []).map((item) => {
    const qty = item.quantity || 1;
    const name = escapeHtml(item.name || 'Item');
    const sku = escapeHtml(item.sku || '');

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

  return `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width:640px; margin:0 auto; padding:20px; color:#222;">
  <div style="border-bottom:2px solid #0a0806; padding-bottom:12px; margin-bottom:16px;">
    <h1 style="margin:0; font-size:22px;">🎤 Commande #${escapeHtml(String(orderNum))}</h1>
    <div style="color:#666; font-size:13px; margin-top:4px;">${escapeHtml(date)}</div>
  </div>
  <table style="width:100%; font-size:14px; margin-bottom:20px;">
    <tr><td style="padding:4px 8px 4px 0; color:#888; width:90px;">Client</td><td style="padding:4px 0;"><strong>${escapeHtml(s.name || '—')}</strong></td></tr>
    <tr><td style="padding:4px 8px 4px 0; color:#888; vertical-align:top;">Ship to</td><td style="padding:4px 0;">${escapeHtml(shipTo || '—')}</td></tr>
    <tr><td style="padding:4px 8px 4px 0; color:#888;">Via</td><td style="padding:4px 0;">${escapeHtml(shippingMethod)}</td></tr>
    <tr><td style="padding:4px 8px 4px 0; color:#888;">Paiement</td><td style="padding:4px 0;">${escapeHtml(paymentMethod)}</td></tr>
    ${orderComments ? `<tr><td style="padding:4px 8px 4px 0; color:#888; vertical-align:top;">Note</td><td style="padding:4px 0; font-style:italic; color:#c8a86a;">${escapeHtml(orderComments)}</td></tr>` : ''}
  </table>
  <h2 style="font-size:16px; border-bottom:1px solid #ccc; padding-bottom:6px; margin-bottom:0;">À PICKER</h2>
  <table style="width:100%; border-collapse:collapse;">${itemsHtml}</table>
  <div style="margin-top:20px; padding-top:12px; border-top:2px solid #0a0806; font-size:14px;">
    <div style="display:flex; justify-content:space-between;"><span>Items</span><span>$${itemsTotal} ${currency}</span></div>
    <div style="display:flex; justify-content:space-between;"><span>Shipping</span><span>$${shipCost} ${currency}</span></div>
    <div style="display:flex; justify-content:space-between; font-weight:bold; margin-top:4px;"><span>Total</span><span>$${total} ${currency}</span></div>
  </div>
</body>
</html>`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}