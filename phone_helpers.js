/**
 * Shared Indian Phone & WhatsApp Helper
 * Strictly never invents digits or area codes.
 */

function cleanPhoneDigits(raw) {
  if (!raw || typeof raw !== 'string' || raw === 'Not available') return '';
  let s = raw.trim().replace(/[\s\-]/g, '');
  let d = s.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 11) && d.startsWith('91')) {
    d = d.slice(2);
  } else if (d.length === 11 && d.startsWith('0')) {
    d = d.slice(1);
  }
  return d;
}

function isIndianMobileNumber(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s || s === 'Not available') return false;

  let d = cleanPhoneDigits(s);
  if (d.length !== 10) return false;
  if (!/^[6-9]/.test(d)) return false;

  const parts = s.split(/[\s\-]+/).filter(Boolean);
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const prevPart = parts[parts.length - 2];
    if (lastPart.length === 5 && prevPart.replace(/^0|^(\+91)/, '').length === 5) {
      return true;
    }
    if (lastPart.length === 4 || lastPart.length === 6 || lastPart.length === 7 || lastPart.length === 8) {
      return false;
    }
  }

  return true;
}

function formatIndianPhoneNumber(raw) {
  if (!raw || typeof raw !== 'string') return 'Not available';
  const s = raw.trim();
  if (!s || s === 'Not available') return 'Not available';

  if (isIndianMobileNumber(s)) {
    const d = cleanPhoneDigits(s);
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }

  if (s.startsWith('+91')) {
    return s.replace(/^\+91\s*/, '+91 ');
  }

  if (s.startsWith('0')) {
    return `+91 ${s.slice(1).trim()}`;
  }

  return `+91 ${s}`;
}

function getWhatsAppNumber(whatsappOverride, rawPhone) {
  if (whatsappOverride) {
    const d = cleanPhoneDigits(String(whatsappOverride));
    if (d.length === 10 && /^[6-9]/.test(d)) {
      return '91' + d;
    }
  }
  if (rawPhone && isIndianMobileNumber(rawPhone)) {
    const d = cleanPhoneDigits(rawPhone);
    if (d.length === 10 && /^[6-9]/.test(d)) {
      return '91' + d;
    }
  }
  return null;
}

function buildTelUri(digitsOrRaw) {
  if (!digitsOrRaw) return null;
  const s = String(digitsOrRaw).trim();
  if (!s || s === 'Not available') return null;
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length >= 7) {
    const stripped = digits.startsWith('91') && digits.length > 10 ? digits.slice(2) : (digits.startsWith('0') ? digits.slice(1) : digits);
    return `tel:+91${stripped}`;
  }
  return `tel:${digits}`;
}

module.exports = {
  cleanPhoneDigits,
  isIndianMobileNumber,
  formatIndianPhoneNumber,
  getWhatsAppNumber,
  buildTelUri
};
