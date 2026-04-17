import PDFDocument from 'pdfkit';

export function buildPickingPdf(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const orderNum = order.vendorOrderNumber || order.id;
      const date = new Date(order.createDate || Date.now()).toLocaleString('fr-CA', {
        dateStyle: 'long',
        timeStyle: 'short',
      });

      // --- Header
      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(`Commande #${orderNum}`, { continued: false });
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#666')
        .text(date);
      doc.moveDown(0.5);
      doc
        .strokeColor('#0a0806')
        .lineWidth(2)
        .moveTo(60, doc.y)
        .lineTo(552, doc.y)
        .stroke();
      doc.moveDown(0.8);

      // --- Infos client / expédition
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

      doc.fillColor('#222').fontSize(10);
      const infoLine = (label, value) => {
        doc.font('Helvetica').fillColor('#888').text(label, { continued: true, width: 80 });
        doc.font('Helvetica-Bold').fillColor('#222').text(`  ${value || '—'}`);
      };

      infoLine('Client', s.name || '—');
      infoLine('Ship to', shipTo);
      infoLine('Via', shippingMethod);
      infoLine('Paiement', paymentMethod);
      if (orderComments) {
        doc.moveDown(0.3);
        doc.font('Helvetica').fillColor('#888').text('Note client', { continued: false });
        doc.font('Helvetica-Oblique').fillColor('#c8a86a').text(orderComments);
      }

      doc.moveDown(1);

      // --- Section À PICKER
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#0a0806')
        .text('À PICKER');
      doc
        .strokeColor('#ccc')
        .lineWidth(1)
        .moveTo(60, doc.y + 2)
        .lineTo(552, doc.y + 2)
        .stroke();
      doc.moveDown(0.8);

      // Items + sous-options (None filtrés)
      (order.items || []).forEach((item) => {
        const qty = item.quantity || 1;
        const name = item.name || 'Item';
        const sku = item.sku || '';

        const opts = (item.selectedOptions || []).filter((opt) => {
          const v = String(opt.value || '').trim();
          return v && v.toLowerCase() !== 'none';
        });

        // Checkbox + qty + nom
        const yStart = doc.y;
        doc
          .rect(60, yStart + 2, 12, 12)
          .strokeColor('#222')
          .lineWidth(1.2)
          .stroke();

        doc
          .fontSize(13)
          .font('Helvetica-Bold')
          .fillColor('#222')
          .text(`${qty}×  ${name}`, 82, yStart, { width: 470 });

        // SKU discret
        if (sku) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#888')
            .text(`SKU: ${sku}`, 82);
        }

        // Sous-options, chacune avec sa propre checkbox
        opts.forEach((o) => {
          const yOpt = doc.y + 2;
          doc
            .rect(100, yOpt + 2, 10, 10)
            .strokeColor('#444')
            .lineWidth(1)
            .stroke();
          doc
            .fontSize(10)
            .font('Helvetica')
            .fillColor('#444')
            .text(`${o.name}: `, 118, yOpt, { continued: true });
          doc.font('Helvetica-Bold').fillColor('#222').text(o.value);
        });

        doc.moveDown(0.8);
      });

      doc.moveDown(1);

      // --- Footer totaux
      const itemsTotal = Number(order.subtotal || 0).toFixed(2);
      const shipCost = Number(order.shippingOption?.shippingRate || 0).toFixed(2);
      const total = Number(order.total || 0).toFixed(2);
      const currency = order.currency || 'USD';

      doc
        .strokeColor('#0a0806')
        .lineWidth(2)
        .moveTo(60, doc.y)
        .lineTo(552, doc.y)
        .stroke();
      doc.moveDown(0.4);

      const totalLine = (label, value, bold = false) => {
        const y = doc.y;
        doc
          .fontSize(10)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor('#222')
          .text(label, 60, y, { width: 400 });
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(`$${value} ${currency}`, 60, y, { width: 492, align: 'right' });
      };

      totalLine('Items', itemsTotal);
      totalLine('Shipping', shipCost);
      doc.moveDown(0.2);
      totalLine('Total', total, true);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}