import PDFDocument from 'pdfkit';
import checklists from './_checklists.json' with { type: 'json' };

// Matche le SKU + options → retourne toutes les sections applicables
function resolveSections(sku, selectedOptions) {
  const cl = checklists[sku];
  if (!cl) return null; // pas de checklist → fallback au format simple

  const sections = [];

  // 1) _default : toujours inclus si présent
  if (cl._default?.sections) {
    sections.push(...cl._default.sections);
  }

  // 2) Pour chaque option sélectionnée non-None, chercher une clé "Name=Value"
  for (const opt of selectedOptions || []) {
    const val = String(opt.value || '').trim();
    if (!val || val.toLowerCase() === 'none') continue;
    const key = `${opt.name}=${val}`;
    if (cl[key]?.sections) {
      sections.push(...cl[key].sections);
    }
  }

  return sections.length ? sections : null;
}

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

      // === Header
      doc.fontSize(32).font('Helvetica-Bold').fillColor('#0a0806').text(`Commande #${orderNum}`);
      doc.moveDown(0.2);
      doc.fontSize(22).font('Helvetica').fillColor('#222').text(customerName);
      doc.moveDown(0.5);
      doc.strokeColor('#0a0806').lineWidth(2).moveTo(60, doc.y).lineTo(552, doc.y).stroke();
      doc.moveDown(0.8);


      doc.fontSize(14).font('Helvetica-Bold').fillColor('#0a0806').text('À PICKER');
      doc.strokeColor('#ccc').lineWidth(1).moveTo(60, doc.y + 2).lineTo(552, doc.y + 2).stroke();
      doc.moveDown(0.8);

      // === Items
      (order.items || []).forEach((item) => {
        const qty = item.quantity || 1;
        const name = item.name || 'Item';
        const sku = item.sku || '';
        const selectedOptions = item.selectedOptions || [];
        const sections = resolveSections(sku, selectedOptions);

        // Titre du produit
        const yStart = doc.y;
        doc.rect(60, yStart + 2, 14, 14).strokeColor('#222').lineWidth(1.2).stroke();
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#222')
          .text(`${qty}×  ${name}`, 84, yStart, { width: 468 });
        if (sku) {
          doc.fontSize(9).font('Helvetica').fillColor('#888').text(`SKU: ${sku}`, 84);
        }
        doc.moveDown(0.3);

        if (sections) {
          // --- Rendu détaillé via checklist
          sections.forEach((section) => {
            doc.moveDown(0.4);
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#0a0806')
              .text(section.title, 84);
            doc.moveDown(0.2);

            (section.items || []).forEach((it) => {
              const itemQty = (it.qty || 1) * qty;
              const y = doc.y + 2;
              doc.rect(100, y + 2, 10, 10).strokeColor('#444').lineWidth(1).stroke();
              doc.fontSize(11).font('Helvetica').fillColor('#222')
                .text(`${itemQty}×  ${it.text}`, 118, y);

              // Sub-items (ex: standoff kit → vis 16mm, 25mm, etc.)
              if (it.subItems && it.subItems.length) {
                it.subItems.forEach((sub) => {
                  const subQty = (sub.qty || 1) * qty;
                  const ySub = doc.y + 2;
                  doc.rect(130, ySub + 2, 9, 9).strokeColor('#666').lineWidth(0.8).stroke();
                  doc.fontSize(10).font('Helvetica').fillColor('#444')
                    .text(`${subQty}×  ${sub.text}`, 145, ySub);
                });
              }
            });
          });
        } else {
          // --- Fallback : pas de checklist, on affiche les options comme maintenant
          const opts = selectedOptions.filter((opt) => {
            const v = String(opt.value || '').trim();
            return v && v.toLowerCase() !== 'none';
          });
          opts.forEach((o) => {
            const y = doc.y + 3;
            doc.rect(100, y + 2, 10, 10).strokeColor('#444').lineWidth(1).stroke();
            doc.fontSize(11).font('Helvetica').fillColor('#444')
              .text(`${o.name}: `, 118, y, { continued: true });
            doc.font('Helvetica-Bold').fillColor('#222').text(o.value);
          });
        }

        doc.moveDown(1);
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
