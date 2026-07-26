import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import type { TenantUser, StudentStatus } from '../api/types';

export interface StudentRow extends TenantUser {
  regId: string;
  grade: string;
  status: StudentStatus;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function makeQr(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: '#0f172a', light: '#ffffff' } });
}

export function downloadStudentsCsv(rows: StudentRow[], institute: string) {
  const header = ['Reg ID', 'Name', 'Email', 'Class', 'Status', 'Joined'];
  const body = rows.map((r) => [
    r.regId,
    r.name,
    r.email,
    r.grade,
    r.status,
    new Date(r.createdAt).toLocaleDateString(),
  ]);
  const csv = [header, ...body]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `Students - ${institute}.csv`);
}

export function downloadStudentsPdf(rows: StudentRow[], institute: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(`Students Report - ${institute}`, 40, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${new Date().toLocaleString()}   |   ${rows.length} students`, 40, 66);

  autoTable(doc, {
    startY: 84,
    head: [['ID', 'Name', 'Email', 'Class', 'Status']],
    body: rows.map((r) => [r.regId, r.name, r.email, r.grade, r.status]),
    styles: { fontSize: 9, cellPadding: 6, textColor: [30, 41, 59] },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 247, 254] },
    margin: { left: 40, right: 40 },
  });

  doc.save(`Students Report - ${institute}.pdf`);
}

export async function downloadIdCard(row: StudentRow, institute: string, qrDataUrl: string) {
  const W = 360;
  const H = 220;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [W, H] });

  // Card background
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, H, 'F');
  // Left panel
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, 150, H, 'F');
  // Accent stripe
  doc.setFillColor(37, 99, 235);
  doc.rect(150, 0, 4, H, 'F');

  // Institute (left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(96, 165, 250);
  doc.text(institute.toUpperCase(), 75, 95, { align: 'center', maxWidth: 130 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('STUDENT PORTAL', 75, 135, { align: 'center' });

  // Right details
  const x = 172;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(96, 165, 250);
  doc.text(row.freeIdCard ? 'FREE IDENTITY CARD' : 'IDENTITY CARD', x, 42);
  doc.setDrawColor(96, 165, 250);
  doc.setLineWidth(1);
  doc.line(x, 48, x + 60, 48);

  const field = (label: string, value: string, y: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(label.toUpperCase(), x, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(value, x, y + 14, { maxWidth: 120 });
  };
  field('Student Name', row.name, 68);
  field('Registration ID', row.regId, 108);
  field('Class', row.grade, 148);

  // QR
  doc.addImage(qrDataUrl, 'PNG', W - 92, 66, 74, 74);

  doc.save(`ID Card - ${row.name}.pdf`);
}
