import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface CertificatePdfData {
  certNumber: number | string;
  verifyCode: string;
  candidateName: string;
  courseName: string;
  score: number;
  issueDate: string;
  verifyUrl: string;
}

export interface GeneratedPdfResult {
  pdfBuffer: Buffer;
  pdfSha256: string;
  pdfPath: string;
}

/**
 * Generate official PDF certificate with embedded QR Code pointing to the verification URL.
 * Computes SHA-256 and saves to a private storage directory.
 */
export async function generateCertificatePdf(
  data: CertificatePdfData,
  storageBaseDir?: string
): Promise<GeneratedPdfResult> {
  const privateDir =
    storageBaseDir || path.resolve(process.cwd(), 'storage', 'private', 'certificates');

  if (!fs.existsSync(privateDir)) {
    fs.mkdirSync(privateDir, { recursive: true });
  }

  // 1. Generate QR Code image buffer pointing to verification URL
  const qrPngBuffer = await QRCode.toBuffer(data.verifyUrl, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 140,
    color: {
      dark: '#1e1b4b', // deep indigo
      light: '#ffffff',
    },
  });

  // 2. Generate PDF using PDFKit
  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 40,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // Outer Decorative Border
    doc
      .lineWidth(3)
      .strokeColor('#4f46e5')
      .rect(20, 20, doc.page.width - 40, doc.page.height - 40)
      .stroke();

    doc
      .lineWidth(1)
      .strokeColor('#cbd5e1')
      .rect(26, 26, doc.page.width - 52, doc.page.height - 52)
      .stroke();

    // Header
    doc
      .fontSize(12)
      .fillColor('#64748b')
      .font('Helvetica-Bold')
      .text('FICTIONAL SKILLS PROGRAMME OF INDIA', 0, 60, {
        align: 'center',
        characterSpacing: 2,
      });

    doc
      .fontSize(28)
      .fillColor('#1e1b4b')
      .font('Helvetica-Bold')
      .text('CERTIFICATE OF VOCATIONAL COMPETENCY', 0, 95, { align: 'center' });

    doc
      .fontSize(11)
      .fillColor('#64748b')
      .font('Helvetica')
      .text('This is to officially certify that', 0, 150, { align: 'center' });

    // Candidate Name
    doc
      .fontSize(24)
      .fillColor('#4338ca')
      .font('Helvetica-Bold')
      .text(data.candidateName, 0, 180, { align: 'center' });

    // Underline
    doc
      .moveTo(doc.page.width / 2 - 150, 215)
      .lineTo(doc.page.width / 2 + 150, 215)
      .lineWidth(1)
      .strokeColor('#cbd5e1')
      .stroke();

    // Body Prose
    doc
      .fontSize(12)
      .fillColor('#334155')
      .font('Helvetica')
      .text(
        `has successfully completed all prescribed training modules and passed the comprehensive competency assessment for`,
        100,
        235,
        { align: 'center', width: doc.page.width - 200 }
      );

    // Course Name
    doc
      .fontSize(18)
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .text(data.courseName, 0, 275, { align: 'center' });

    doc
      .fontSize(12)
      .fillColor('#16a34a')
      .font('Helvetica-Bold')
      .text(`Assessment Score: ${data.score} / 100 (Certified Passed)`, 0, 310, {
        align: 'center',
      });

    // Embed QR Code on bottom right
    const qrX = doc.page.width - 190;
    const qrY = doc.page.height - 180;
    doc.image(qrPngBuffer, qrX, qrY, { width: 110, height: 110 });

    doc
      .fontSize(8)
      .fillColor('#64748b')
      .font('Helvetica')
      .text('Scan with any mobile camera to verify authenticity', qrX - 20, qrY + 115, {
        width: 150,
        align: 'center',
      });

    // Metadata & Verification details on bottom left
    const metaX = 60;
    const metaY = doc.page.height - 180;

    doc
      .fontSize(10)
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .text(`Certificate No: ${data.certNumber}`, metaX, metaY);

    doc
      .fontSize(9)
      .fillColor('#475569')
      .font('Helvetica')
      .text(`Verification Code: ${data.verifyCode}`, metaX, metaY + 18)
      .text(`Date of Issuance: ${data.issueDate}`, metaX, metaY + 34)
      .text(`Issuing Authority: Directorate of Vocational Skills`, metaX, metaY + 50);

    // Official Stamp Seal Simulation
    doc
      .circle(doc.page.width / 2, doc.page.height - 120, 36)
      .lineWidth(2)
      .strokeColor('#e2e8f0')
      .stroke();

    doc
      .fontSize(7)
      .fillColor('#94a3b8')
      .font('Helvetica-Bold')
      .text('OFFICIAL\nDIGITAL SEAL\nVERIFIED', doc.page.width / 2 - 30, doc.page.height - 132, {
        align: 'center',
        width: 60,
      });

    doc.end();
  });

  // 3. Compute SHA-256 of the generated PDF
  const pdfSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  // 4. Save to private storage location
  const filename = `cert_${data.certNumber}_${data.verifyCode}.pdf`;
  const pdfPath = path.join(privateDir, filename);
  fs.writeFileSync(pdfPath, pdfBuffer);

  return {
    pdfBuffer,
    pdfSha256,
    pdfPath,
  };
}
