/**
 * Pure utility for downloading CSV files with UTF-8 BOM for Excel compatibility.
 */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
): void {
  const escapeField = (field: string | number): string => {
    const stringField = String(field);
    if (
      stringField.includes(',') ||
      stringField.includes('"') ||
      stringField.includes('\n') ||
      stringField.includes('\r')
    ) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
  };

  const headerRow = headers.map(escapeField).join(',');
  const bodyRows = rows.map((row) => row.map(escapeField).join(',')).join('\n');

  const csvContent = [headerRow, bodyRows].filter(Boolean).join('\n');
  
  // Prepend UTF-8 BOM (\uFEFF) for Excel to correctly handle accents/special characters
  const blob = new Blob([ '\uFEFF' + csvContent ], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
