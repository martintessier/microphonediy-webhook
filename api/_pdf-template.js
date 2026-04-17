import PDFDocument from 'pdfkit';

export function buildPickingPdf(order) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const orderNum = order.vendorOrderNumber || order.id;
      const customerName = order.shippingPerson?.name || order.billingPerson?.name || '—';
      const orderComments = order.orderComments || '';

      // --- Header : numéro de commande en gros
      doc
        .fontSize(32)
        .font('Helvetica-Bold')
        .fillColor('#0a0806')
        .text(`Commande #${orderNum}`);

      doc.moveDown(0.2);

      // --- Nom du client en gros juste en dessous
      doc
        .fontSize(22)
        .font('Helvetica')
        .fillColor('#222')
        .text(customerName);

      doc.moveDown(0.5);

      // Ligne de séparation
      doc
        .strokeColor('#0a0806')
        .lineWidth(2)
        .moveTo(60, doc.y)
        .lineTo(552, doc.y)
        .stroke();
      doc.moveDown(0.8);

      // Note client si présente
      if (orderComments) {
        doc
          .fontSize(11)
          .font('Helvetica-Oblique')
          .fillColor('#c8a86a')
          .text(`Note: ${orderComments}`);
        doc.moveDown(0.8);
      }

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

        const yStart = doc.y;
        doc
          .rect(60, yStart + 2, 14, 14)
          .strokeColor('#222')
          .lineWidth(1.2)
          .stroke();

        doc
          .fontSize(14)
          .font('Helvetica-Bold')
          .fillColor('#222')
          .text(`${qty}×  ${name}`, 84, yStart, { width: 468 });

        if (sku) {
          doc
            .fontSize(9)
            .font('Helvetica')
            .fillColor('#888')
            .text(`SKU: ${sku}`, 84);
        }

        opts.forEach((o) => {
          const yOpt = doc.y + 3;
          doc
            .rect(100, yOpt + 2, 10, 10)
            .strokeColor('#444')
            .lineWidth(1)
            .stroke();
          doc
            .fontSize(11)
            .font('Helvetica')
            .fillColor('#444')
            .text(`${o.name}: `, 118, yOpt, { continued: true });
          doc.font('Helvetica-Bold').fillColor('#222').text(o.value);
        });

        doc.moveDown(1);
      });

      } catch (err) {
      reject(err);
    }
  });
}