// api/pdf-server.js — Génération PDF côté serveur avec pdfkit
// Utilisé par le cron poll-payments pour joindre la facture à l'email

const PDFDocument = require('pdfkit');

/**
 * Génère un PDF de facture et retourne un Buffer base64
 * Fidèle au modèle : bandeau bleu, logo, tableau, signature, TVA
 */
async function generateInvoicePDF(invoice, settings, signatureB64) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const chunks = [];
    doc.on('data',  chunk => chunks.push(chunk));
    doc.on('end',   () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);

    const { praticien, patient, lines, status, invoiceNumber, invoiceDate } = invoice;
    const total      = lines.reduce((s, l) => s + ((l.qty||0)*(l.unitPrice||0)), 0);
    const isPaid     = status === 'paid';
    const isCancelled= status === 'cancelled';
    const dateStr    = new Date(invoiceDate||Date.now()).toLocaleDateString('fr-FR');
    const patientLabel = [patient.civilite, patient.prenom, patient.nom].filter(Boolean).join(' ');
    const adresseLines = (praticien.adresse||'').split('\n').filter(Boolean);

    // ── Couleurs ──
    const NAVY   = '#1a3a5c';
    const BLUE   = '#3b82c4';
    const GRAY   = '#64748b';
    const BLACK  = '#1e293b';
    const GREEN  = '#16a34a';
    const RED    = '#dc2626';
    const LIGHT  = '#e8f0f8';

    const W = 505; // largeur utile
    let y = 45;

    // ── Bandeau haut ──
    doc.rect(45, y, W, 5).fill(NAVY);
    y += 19;

    // ── Titre ──
    doc.font('Helvetica-Bold').fontSize(22).fillColor(BLACK)
       .text('Facture', 45, y, { align: 'center', width: W });
    y += 38;

    // ── Logo (si disponible) ──
    let logoX = 370;
    if (signatureB64 && signatureB64.startsWith('data:image')) {
      try {
        const logoData = Buffer.from(signatureB64.split(',')[1], 'base64');
        doc.image(logoData, logoX, y, { width: 50 });
      } catch(e) {}
    }

    // ── Bloc praticien (gauche) ──
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
       .text(praticien.nom || '', 45, y);
    let py = y + 16;
    doc.font('Helvetica').fontSize(9.5).fillColor(GRAY);
    if (praticien.adeli) { doc.text(`N° ADELI : ${praticien.adeli}`, 45, py); py += 13; }
    if (praticien.titre) { doc.text(praticien.titre, 45, py); py += 13; }
    adresseLines.forEach(l => { doc.text(l, 45, py); py += 13; });
    if (praticien.tel)   { doc.text(`Tel. ${praticien.tel}`, 45, py); py += 13; }

    // ── Bloc date (droite) ──
    const metaX = 360;
    let   metaY = y;
    doc.font('Helvetica').fontSize(9.5).fillColor(GRAY)
       .text('Date :', metaX, metaY).text(dateStr, metaX + 80, metaY);
    metaY += 15;
    doc.text('N° de facture :', metaX, metaY);
    doc.font('Helvetica-Bold').fillColor(BLACK).text(invoiceNumber, metaX + 80, metaY);
    y = Math.max(py, metaY + 20) + 10;

    // ── Séparateur bleu ──
    doc.rect(45, y, W, 3).fill(BLUE);
    y += 13;

    // ── Adresse facturation ──
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('Adresse de facturation :', 45, y);
    y += 13;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(patientLabel, 45, y);
    y += 18;

    // ── Tableau — en-tête ──
    const COL = [45, 83, 370, 460, 550];
    const ROW_H = 22;
    doc.rect(45, y, W, ROW_H).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('white');
    doc.text('Qté',          COL[0]+2, y+6, { width:35, align:'center' });
    doc.text('Description',  COL[1]+4, y+6);
    doc.text('Prix unitaire',COL[2]+4, y+6, { width:85, align:'right' });
    doc.text('Total',        COL[3]+4, y+6, { width:85, align:'right' });
    y += ROW_H;

    // ── Ligne catégorie ──
    doc.rect(45, y, W, ROW_H).fill(LIGHT);
    const catLabel = 'Séance(s) de soutien psychologique' + (invoice.categoryNote ? ' — ' + invoice.categoryNote : '');
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(NAVY)
       .text(catLabel, COL[1]+4, y+6);
    y += ROW_H;

    // ── Lignes de facturation ──
    lines.forEach(line => {
      const lt = ((line.qty||0)*(line.unitPrice||0)).toFixed(2).replace('.',',') + ' €';
      const up = parseFloat(line.unitPrice||0).toFixed(2).replace('.',',') + ' €';
      doc.rect(45, y, W, 0.5).fill('#e2e8f0'); // séparateur
      doc.font('Helvetica').fontSize(9.5).fillColor(BLACK);
      doc.text(String(line.qty||0),   COL[0]+2, y+6, { width:35, align:'center' });
      doc.text(line.description||'',  COL[1]+4, y+6);
      doc.text(up,                    COL[2]+4, y+6, { width:85, align:'right' });
      doc.text(lt,                    COL[3]+4, y+6, { width:85, align:'right' });
      y += ROW_H;
    });

    // ── Lignes vides (max 10 items page 1) ──
    const emptyCount = Math.max(10 - lines.length - 1, 0); // -1 pour catégorie
    for (let i = 0; i < emptyCount; i++) {
      doc.rect(45, y, W, 0.5).fill('#e2e8f0');
      y += ROW_H;
    }

    // ── Bordure tableau ──
    doc.rect(45, 45+24+38, W, y - (45+24+38) + 18).stroke('#e2e8f0');

    // ── Signature ──
    if (signatureB64 && signatureB64.startsWith('data:image')) {
      try {
        const sigData = Buffer.from(signatureB64.split(',')[1], 'base64');
        doc.image(sigData, 45 + W/2 - 82, y + 8, { width: 165 });
        y += 70;
      } catch(e) { y += 10; }
    } else {
      y += 10;
    }

    // ── Total ──
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
       .text('Total', 370, y, { width: 70 })
       .text(total.toFixed(2).replace('.',',') + ' €', 440, y, { width: 110, align:'right' });
    y += 16;

    if (isPaid) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(GREEN)
         .text('Payé', 370, y, { width: 70 })
         .text(total.toFixed(2).replace('.',',') + ' €', 440, y, { width: 110, align:'right' });
    } else if (isCancelled) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(RED)
         .text('FACTURE ANNULÉE', 45, y, { align:'center', width: W });
    } else {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#d97706')
         .text("En l'attente de votre règlement", 45, y, { align:'center', width: W });
    }
    y += 28;

    // ── Séparateur bas ──
    doc.rect(45, y, W, 3).fill(BLUE);
    y += 11;

    // ── SIRET + TVA + Remerciement ──
    if (praticien.siret) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
         .text(`SIRET : ${praticien.siret}`, 45, y);
      y += 14;
    }
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRAY)
       .text('TVA non applicable, art. 261-4-1° du CGI', 45, y);
    y += 18;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK)
       .text(`En vous remerciant ${patientLabel},`, 45, y, { align:'center', width: W });

    // ── Filigrane ANNULÉE (diagonale, semi-transparent) ─────────────
    if (isCancelled) {
      doc.save();
      doc.translate(297, 420) // centre de la page A4
         .rotate(-45);
      doc.font('Helvetica-Bold')
         .fontSize(90)
         .fillOpacity(0.10)
         .fillColor('#dc2626')
         .text('ANNULÉE', -200, -45, { width: 400, align: 'center' });
      doc.restore();
    }

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
