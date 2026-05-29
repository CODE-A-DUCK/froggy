export function formatUploadDate(dateStr) {
  if (!dateStr) return null;
  return dateStr.length === 8
    ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
    : dateStr;
}
