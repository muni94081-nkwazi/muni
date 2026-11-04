export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) {
    downloadTextFile(filename, '', 'text/csv');
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (val: string | number) => {
    const s = String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? '')).join(',')),
  ];
  downloadTextFile(filename, lines.join('\n'), 'text/csv');
}

export function downloadJson(filename: string, data: unknown) {
  downloadTextFile(filename, JSON.stringify(data, null, 2), 'application/json');
}
