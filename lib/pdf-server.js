// api/pdf-server.js — Génération PDF côté serveur avec pdfkit
// Utilisé par le cron poll-payments pour joindre la facture à l'email

const PDFDocument = require('pdfkit');

// Logo par défaut du cabinet (même image que celle intégrée dans public/js/pdf.js
// d'invoice-pwa) — utilisé uniquement tant qu'aucun logo personnalisé n'a été
// enregistré dans les réglages (voir logoB64, invoice:logo). Indépendant de la
// signature/tampon du praticien, fournie par l'appelant via signatureB64.
const DEFAULT_LOGO_B64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAB1AHgDASIAAhEBAxEB/8QAHAAAAQUBAQEAAAAAAAAAAAAABQABBAYHAgMI/8QANxAAAgIBBAAFAgQFAwMFAAAAAQIDBBEABRIhBhMiMUEUUQcjMmEVQlJxgSQzkRZisRdkcoLw/8QAGAEBAQEBAQAAAAAAAAAAAAAAAQACAwT/xAAgEQEBAAMAAwACAwAAAAAAAAABAAIRIRIxQQNRIjJC/9oADAMBAAIRAxEAPwDeNOBpAafWKlpY0+NC5N9rPuU211S8tyJR5hETNFExGQHYdAn7ZzpjcUxqFb3fbqG3/X2bkMdQjIlLghv7Y9/8az/efG261blazCFgVWerbqzDKCVSCO/deSkkH9j9tVncYvrRtdKpLL/D464cmfv6dWmfzM/BbkAgx2cDHudaMd3F/L3Ra9a8SbbUkiSSbt5RASB1HIU5qr/05BHvqBW8YVZ/EdvaQgXyU9MhbAZ17kXPt0P/AA2gm+w77biSxXMI8tuTUZJVZJ0OCpPPokE8fcZGCMdarRq3K+6WL6VzKDJJ5Fdoy5ZpQ3JWUdkx/mBh9wvwc6tDWWeY8LST4t2kQV7BlkFaedoFmMZC8h9/nB77/Y6LQ2oJ2lWKVHaJ/LkCnPBsA4P2PY/51Qdsq3rew+XvVhlWSZQa4ihZQnarH6QeDcjy6Bx0PviBukU+yW5nltyJFJcgs3ZRj1qgHl8e/wBTsCMZ91z0NQC6tGeWtpaljTY1Rts8SyVNmv75cO5Toz8lisxiP05wojVSQAS2Mn9WDj21aId+2+WEztN5MHFGSaf8tJAyhhxJ98A949j1o0lszGI6YjXQIZQR7EZB02i1c6WnI0tFT6f20gNBt6t0p4U2+WRZFtJKTEoY+YqD1AOOkIJByfsetNQPxn4ouUtssw0orFS1HbhhE8ieh1Yk8kI6IPHiR7jJ/bVcpX9t3reKzz1Ynr3oGsVYLTHyWstKfODED9XRVWIOAF++ht/YV2CyK1rfaUm2Wxn6Vml82aPOQwVFYclIBWQdZHyCRpeRH/CIale5FaoVXSWIoeMmXnySMDIyHMbjrBCHAyNdMdavO+T7i1+SG5sdIfXU5qcoNIx3arBJ5F9S/mkE8eJwpyuME5zkaj7VIkcVpa5SM0pylarcZiRIUDzgsvYdEDKrewLE/wA2ie6bnQrUts2zdQs/8QhH1JYZiVhwQflnpV9xkY4n1d6DTWYtt8QbvXlqHzUke+qBuXKEVlZ0B+ctEqk/K8vvqEZ9NY/EwkGzS7SkQSGZkhryvkgHI4q5ycZYYyejyHeVI0BZpp4pYL1q1AzQ1a8iQxeZK0zjLocnGfLWEMT9sd51xc3ibc/D8CmRG3q9O9TzG6QiJ1YysfYIoXB+Ov2OjcqjY6lRTAk83mtYd9wZYmlkZHzIvq9T8wMgdBGTAyNAaI/s+V01fbPCuzLt8DcZ5LQkSXIduYccZnwAOHSggDoEgZOdV6nZkqOle+hijrc/qYg+ZIsWCqoG916Mjlh3x9iOWdCNugs3aVrfbcryVK4Es2X/ADLcgC+kfsC6qT7KD1knokbFjebU1qaEPfm2eKWzwGF81bA8s59gDG3ZP8vedOJ+4VehF9xD0a8dK0taeC/YWqGrzNJ9M2DiReXa8mCHh2MIe+9AzBHN4khk3GeCnBX4NBBO5LNEgBRVVQxVWbJLEDOTjOvdNzRZ61WtOLUU0RjaGvF5jhhxCSsTgBhHHlASCvPJ4gHM5fB7zWZJ7y34/Omy9dbKgnJxlmjQ4UYCk8jxAA0KE5YOXSu2w7/Lbgi+vlrHnGZBajBhidubLwRX9RwF/V85H31Y+iMjWaDYoB4jgNugvFl/00cl2FkjCjAKxkKWVcfpJ+M9nOrXsPieDdHmhm4Qy/WTV6ynozpH7uB9uj+3WhPt0wyfTH9LTkZ0tYul42rcNGpLasvwhhUu74J4qPc9ax3Y9ztbb41s0hK0u1XZZbICOxSaNg80cyHOPdOJ+D2DrRPGc+6wbYjbRuCUZhyZ3mRREygAcTIwIjbscSfc9fuM42mbxAbVaXdLTipKzPBJNcjuFmHWY0QF2HuGCnBBII9iOgcueXUI2ZaF/bEdaNTd9tLYhilVfOruV6j4sQHx1hVZWIXADdHQ3+Ex26lWHcN4rRQXZeFI7dtnkmKTHTA+kgAgIyEHvAOCMgdZq0qW27lRurZ2xZTG0Ml2rKK4eMkqDJw/SQxGWCkdZBxkz0huWfDnh+zYBhvQ3h/quQlj9UqR5z2HJBjkU5ILL3nsaT1ZNvuH+KZZ7G3Q2dyrSqyoU/iNCLzq0yuFOcD1QvkK3Buu2GewRJ3C3H4j3Ntx23fKL2a7GWhNLKsbFCPVWlR8ZHbBT2MMQemyLQ8KwTTbfX3l0u5janH9aHsEFTyPrAB5jhlM4yuQR0NQI/Ddbcmlj3SrXkdG4taMISbljJC+QesD3LM39tZUxK8dtX/D25wvuUk0G3mm9Db54YKxYkJIgEjDs5IJMnRycch3q2VKrT3ZJ0rx7hVtSL/rZ1Rw1dVCNGQ55D1hiOIIYsNUTdKMvh/cpGoSvxWUBXljAlgsBSUEgHpdJF5KGH6gSD3ogN3SLa4t1oyeR59OLaErq3JqvAl5cH7CMKVPvlx8jUsD+7zSzSR9w2ejSa5i3agqxtgxCFmRmAGRywU9yQgXtj2ASu2+Ga1zcdxh3rcpLllIvNs7fTlKwniekeQAGRsnsAKBnHwBry8LR/wbYa+8WIKw+qijt2vzwJY6zShYkVMH098zn9ROPga8PDjnwrz3Td7kMFjywvkNIJJVywd2ZVPRJCgAkY7Jx7alTsmLyl1dzgtLUfZ6MAr/AE9ciJ4V8uqjTSvKSOl68hRzPvgE96I2N+bddvsilDcgqpE5e5EpaJMj9KSNxXoliSpbsKBnvFWaxA9+zuN7b3j88o1faldUhrxqWKPPyBUuS7MqEH9RYjsaMwX4au2N4kgo7lZ3KScU67XpBJG7vn/b4BQ4ABAGPfrWnH7XlrkvEFSrV2Pao6awyMlRkhk8vsFWPXI4bkrZyCoALewzjXnR3GSTx1/ErBMKVeM80hU8I4PIXAOB1kyYA9ySf31xvkm3bvuXKrYe04nlU163KVhFyUcnYAhAxRjyPfEkgMSMeW7Vd6S3I8VmKGt1K2bUlFx7L5hRgpIHSjtgqhR17m4mrOWLvds9WcWa0Uy5xIgYZUj3H2IBH+e9LQPwaLq7MRf3R9ym55+o6MeMDCowA5gexY95zpa5pq7js3AfxEupaens0exjdJy3nZkgkkjjPsMAEAse/dgAOzoRtVhNr2DdrdgU2uUzMt2DkYEAQsogUr7IY2XgvEAluXZPV08a093s7IJdjmmW7A4fyo2H5yezLhvSxx2AfkfvqjS7bR3aq29X692jvtOIC19HUAlZF6WRY3UkdYwVwVwwz0BrVj/XY3Ota5bfa457VGzWUPFBSmMLTqVAUSK+QxUAKSc49J9s4o0gNyxuO3bJHY2cTxt9XtVwE1iR2ZAwA+nkBHLPSkjojRHam8Mbg1ZIIpZzX5yytfdOfHIJZH5BIuuWTlWyQSWwdJNlseMLELTWLsGwQqXjjsbhLJ9aFA9eHbCRk4Ck5JySD86l12g30go3u9vVdYbu2Dc7lb0C3TSYSnByCfKDr7+oH099j37L/wDqhBVmsR7rtF2ra4k8IpCplfGAGWRA0eexyX4J0f3Dw1uG2SW92imjgp0Bw2unCfy0LcUEpX9OV5M3eSSck9DQvafAMW6eDN03SYM+5bjk1ZbLFmjRWypJOSC7Llj74I+2h0n8qN/Kp2N/3bxOlgLNWr/UBS0MFMZwrAqA59bYIGMN/Yd41XGaxBIa56cxMFdTlHyBxcH/APEAYOMY0aSKSF5YhFJHNESJa/l85IW+VeMdkdnsZBB6yMcYt+dmikjto0cEvaSEP6G9+yygjvsE+5LZxzJCNycV9xSfdF3WaKpt0BYTQQFw5A84xRqOTscBIYyDgH3ILEH06I7b4cuXdyQxbilexGrSxv8AweZIkKjOVkBQj9mCDPxnVb8M7w230bq1mRLsvlxGdj/swoGd2B+OwnYycL13jVjg8cPLVqUf4rNHXRcMWSSSeU5Jy0pfKEknqNSQDjkcaXG3i7pm4bHu+2SyXL/hna9/VDylsV0LsGxn1qnEnIOe0J77J16bXulzxjwrtfp7fUMvCavRcG6igEHJkIESBSRlATg4A716zeI9vsSVpFSorU2Xy5RuUSGBFZWCKjiNkOEClmBPEkerXdlrPi/b0lqbVTtyxS8pN3WqZEroCMJC5RnmlGP1gFRn5ONVr7TttpUZPDEmzXtojjgR/OajWgy1NTjiXcdibA5eo8jy9sda622Hb/Ji2Svcu7hXjtLLI9is0SU4j06E4GS+SoAA/W3sNcpsT2qlmvtNSmm5U3X0RXJJYphjJGWYes9kkgHkpyfUDriXcN0G40WrJHSggpGQJXkUQ+e8cgb1Do4OPk8VUk4+QjLmqzeB6MGyTXdri3SOySRMarAGauf0kSFWK56AP3Izpa8fww2mlS2WzcqXobhsyhWkgDeWoQYwCwBbsklvknS0NrDmNcb1GLcaUlSdpRFKOLeVI0bY/wDkpBGsu3+gngWN5Kp3G+7kClWlfkrMf1OSg5rwGOwQWyB3rW9cuvNCuSMjGQcHSWk3Yc25B71HbfElAvPbsQNLFMZD5SSPxjUozsObYLN8qgx+o9aD4R2/crWzuN7M8duGzLGjhuLFc/8AjsgfGAv2GvUeA6B8Zxb+3qSGCNIq57CyplRIT8kL0M+x71bQMDU6SAd0DcK9ddjs1ZRxrGu0bekvheOPb3PWsu/6l3Lbl8PVzuU9DaZdrhMAr1EIkdU9QLuGz0OWPT12Tq9eNLz1NuiSQWY9umk4XbFZCzxR49gB2OR9Jb4B++CCNettG7bfBKtOCasg/J82DHEYx0GGR0Mf261EvbPt92Db/GXhpt82/wAm1ulVfyZ0iaMTqBkxsD7Z+CpODgjrI1m9e09arHNHZcRSDknnyso9skcs8ehn+Ye3YHtrat/32wwO3bZA0kxBSMImeJx74HuQCDjpRkcmXVNh8ExUvD/mBasUkkn59iWcAV6ytzd/V75ZQvS4x/c6MbGWO7Md1KnNmesFL/paFwUnx3w5L0c/v2MfI9iEsrUpZFgq7fZWmf8AVS2YFm81lBZ0UNkInpZQFAOByJ71573fg3PfLu4U4/Ko2D5SqqcfNAJw4X78mBHz7D76KeHNit7/AHq+won5sr+buMy9rChYFwT7Fjjh9h2Bn1Ea3o1cw7yOz7LXh3ncLuy06lSztUqsta4vmVZ4HHJf15MZx7kZX2I4965bda8Vr683bcPiCN8CvvE6xR12wCCp6jlAByoBVfYka2PdtslsUpf4f5UFthGnmHrkitkpywcZBYZwcZ1lF2e3t/iTbNtpyPXguQisfIDouHsSrhAQP9oleJwOhj9LY1e7oge6ftG/2K2zyz7ju9O7O83mPJVaNIawz3znVQgZjjkQScDADHUdG3/ft4LeHd6208h3Ikpibj8ng8ZJTP8AKpx8sWYk6evs3iDcXt7bv+32be414/Mp2BMYVkwQHQScShyO1LDkOwTrQPD3hDZ9rrwWU29hdIEjSW382aNsdjl7DHY9PWjWnddTR6jW3Vp6m3QQWbP1M6IFebywnM/J4jof2GlqVpaG6S0+m0/xpqfS0w0+qoH4vpT7h4T3StWZ1neu3llHCtkdjs9fHsej7HXj4Pn3G14eqWr12S0k8SvE09VYZip7BcKxXJGPbGj08KWIJIZF5RyKVYfcEYOq0nhzfIqiUovEzx1I0EcZFJDMFAwMuTgkD546oud8tbfsNead7CpI0WHVmAXiGZssT7D1HPYzrIPGZO9Q7Zv1oFKklnyaxYEZhQc3kI/7j2Mj2XPzov438BW9t3rabkm6W9zpWbPlPHb4/lycSynCgLg8T8e4HvnRz8SttWp4N23koZ6siSFPh+Xodf8AIkxpeFh+2UiO0b1OjGmLhPkwn+mUvwU/4L5/+oOvpHwv4X2/wptEdCjH8AzTN+qZ8Y5Mf/A9gOtfPFKxHtm4bZcD+d9DLFZSXHckKFSwI+4Q5H7dfbH1BFKk0ayRuro4DKynIIPYOjdfjNXeOsahWtqp3b1O3YgWSamzPAx/kYjBP/Gpulquk2APYaWn02qptLTHS0VLT6YaQ1FXWn1zqJuG6VNqr+fcnWJM4UYLMx+yqMlj+wB01TdLVAt/iYwsGKh4fuTr/XLNFGT/AGjDFz/wNCNx/FW/VfyzS22s4GStixIkoH7RyJHy/wANjVGys34nWa9PwJfszuFeExyQfcyq6sgH75H/ABnVU/FbeElmqbTE3KRiJCgPwuSB/l+P+Ec/GqrvPiyzvSiSZZppcgCa4ERETIJWGujE+rGC7NnjkZwdVqwL+/btPHXL2dztHlYZnBkK/eV+ljjH9IwPjsaNjZyeQ+K3HXrRorFliilx92U8kX/nkP8AGtO/D38SotmqRbJvsx+khAWtb9zGn8of7rjGGHt7H2zqp7jsFGktHZBKrTwcp91vYPGBWAVVx75C8iqfqJZcjJIBaTwVc3ab6jw9tVmtRkdmVdygMcaAnP5QB83HzxI45zg6easYmQ2+Vbde5WSxWninhcZWSJwysP2I617axTafw68T7O5s7bujUp/c/TwOkbH/ALlMp5f5XWh+HN43p2G3+IdvWG0B+Xcr5ME+P2Pcb/PE9H4J9gbG69+1n02lpvfrTMtLS0tZq5B11paWqp9RbG3VLUvmWK8crAcfzF5dfbv40tLSVRbnhnYtxgMNzZtvsRf0yVkYD+3XWqrY/CDww8xei24ba3/tbJwP7B+WP8aWlppBuYPwh2GOTlav7xcyclZbhVT/AH4BSf8AJ0dj8EbRWqipTRqNTIJhp4i5H7lwOZP78s6WlojQRXbdk23Z6i1dvpQ14VbmFRPdvlifct+571P+NLS0zLTe+lpaqmJ0tLS1lq50tLS1Vf/Z';

/**
 * Génère un PDF de facture et retourne un Buffer base64
 * Fidèle au modèle : bandeau bleu, logo, tableau, signature, TVA
 * @param {object} invoice
 * @param {object} settings
 * @param {string} signatureB64 - Signature/tampon du praticien (invoice:signature)
 * @param {string} [logoB64] - Logo personnalisé du cabinet (invoice:logo), remplace
 *                             le logo par défaut ci-dessus si fourni.
 */
async function generateInvoicePDF(invoice, settings, signatureB64, logoB64) {
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

    // ── Bloc praticien (gauche) ──
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
       .text(praticien.nom || '', 45, y);
    let py = y + 16;
    doc.font('Helvetica').fontSize(9.5).fillColor(GRAY);
    if (praticien.adeli) { doc.text(`N° RPPS : ${praticien.adeli}`, 45, py); py += 13; }
    if (praticien.titre) { doc.text(praticien.titre, 45, py); py += 13; }
    adresseLines.forEach(l => { doc.text(l, 45, py); py += 13; });
    if (praticien.tel)   { doc.text(`Tel. ${praticien.tel}`, 45, py); py += 13; }

    // ── Bloc date + logo (droite) ──
    // Colonne droite de 170px (comme le layout pdfmake d'invoice-pwa) : le mini-tableau
    // date/n° de facture occupe la partie gauche, le logo les 52 derniers pixels.
    const rightColX = 45 + W - 170; // 380
    const metaX      = rightColX;
    const logoW       = 46;
    const logoX       = 45 + W - logoW; // aligné au bord droit du contenu
    let   metaY = y;
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
       .text('Date :', metaX, metaY).text(dateStr, metaX + 55, metaY, { width: 65 });
    metaY += 15;
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text('N° de facture :', metaX, metaY);
    metaY += 13;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(BLACK).text(invoiceNumber, metaX, metaY);

    // ── Logo (personnalisé si fourni dans les réglages, sinon logo par défaut) ──
    try {
      const logoSrc  = (logoB64 && logoB64.startsWith('data:image')) ? logoB64 : DEFAULT_LOGO_B64;
      const logoData = Buffer.from(logoSrc.split(',')[1], 'base64');
      doc.image(logoData, logoX, y, { width: logoW });
    } catch(e) {}

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
    const ROW_H = 26; // augmenté pour éviter le chevauchement sur les descriptions longues
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
       .text(catLabel, COL[1]+4, y+7, { width: W-COL[1]+45-8, ellipsis:true, lineBreak:false });
    y += ROW_H;

    // ── Lignes de facturation ──
    lines.forEach(line => {
      const lt = ((line.qty||0)*(line.unitPrice||0)).toFixed(2).replace('.',',') + ' €';
      const up = parseFloat(line.unitPrice||0).toFixed(2).replace('.',',') + ' €';
      doc.font('Helvetica').fontSize(9.5).fillColor(BLACK);
      doc.text(String(line.qty||0),   COL[0]+2, y+7, { width:35, align:'center' });
      doc.text(line.description||'',  COL[1]+4, y+7, { width: COL[2]-COL[1]-8, ellipsis:true, lineBreak:false });
      doc.text(up,                    COL[2]+4, y+7, { width:85, align:'right' });
      doc.text(lt,                    COL[3]+4, y+7, { width:85, align:'right' });
      y += ROW_H;
    });

    // ── Lignes vides (max 10 items page 1) ──
    const emptyCount = Math.max(10 - lines.length - 1, 0); // -1 pour catégorie
    y += emptyCount * ROW_H;

    // ── Signature — forcer un y minimum pour éviter le chevauchement avec le pied de page ──
    y = Math.max(y, 480); // jamais trop bas sur la page
    const SIG_WIDTH      = 165;
    const MAX_SIG_HEIGHT = 90; // Plafond de sécurité : évite qu'un tampon au ratio inhabituel
                                // (très haut/étroit) ne pousse le Total hors de la page.
    if (signatureB64 && signatureB64.startsWith('data:image')) {
      try {
        const sigData = Buffer.from(signatureB64.split(',')[1], 'base64');
        // Hauteur calculée dynamiquement à partir des dimensions réelles de l'image
        // (au lieu d'une hauteur fixe), pour éviter tout chevauchement avec le Total
        // quel que soit le format (rectangulaire, carré ou circulaire) de la signature.
        const img = doc.openImage(sigData);
        let renderWidth = SIG_WIDTH;
        let sigHeight    = renderWidth * (img.height / img.width);
        if (sigHeight > MAX_SIG_HEIGHT) {
          // Ratio conservé : on réduit plutôt la largeur que de dépasser le plafond de hauteur
          sigHeight   = MAX_SIG_HEIGHT;
          renderWidth = sigHeight * (img.width / img.height);
        }
        doc.image(img, 45 + W/2 - renderWidth/2, y + 8, { width: renderWidth });
        y += sigHeight + 8;
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

    // ── SIRET + forme juridique sur la même ligne ──
    const siretText = praticien.siret ? `SIRET : ${praticien.siret}` : '';
    const typeText  = praticien.typeSociete && praticien.nom ? `${praticien.typeSociete} ${praticien.nom}` : '';
    if (siretText) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK).text(siretText, 45, y);
    }
    if (typeText) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(GRAY).text(typeText, 45, y, { align:'right', width: W });
    }
    if (siretText || typeText) y += 14;
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(GRAY)
       .text('TVA non applicable, art. 293 B du CGI', 45, y);
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
