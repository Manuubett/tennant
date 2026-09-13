// ---------------------------------------------------------------------
// mpesa-parser.js
// Parses a pasted M-Pesa confirmation SMS (as the SENDER/payer received
// it) into structured data, and checks whether the recipient matches a
// given landlord's registered payment profile.
//
// Supports three message shapes:
//   - Paybill:     "...sent to [Business] for account [Acc] on [date]..."
//   - Till:        "...paid to [Merchant] on [date]..."
//   - Send Money:  "...sent to [Name] 07XXXXXXXX on [date]..."
//
// Real M-Pesa wording varies slightly over time/region, so each pattern
// below is intentionally a little loose. Treat this as "best effort
// extraction to speed up data entry," not a cryptographic proof of
// payment — that's why every parsed payment still goes into a "pending"
// review queue rather than being trusted blindly.
// ---------------------------------------------------------------------

function parseMpesaMessage(rawMessage) {
  const text = (rawMessage || "").replace(/\s+/g, " ").trim();
  if (!text) return { success: false, error: "Message is empty." };

  const codeMatch = text.match(/^([A-Z0-9]{10})\s+Confirmed/i);
  const transactionCode = codeMatch ? codeMatch[1].toUpperCase() : null;

  const amountMatch = text.match(/Ksh\s?([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;

  const dateMatch = text.match(/on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+([\d:]+\s?[APap][Mm])/);
  const paidAtRaw = dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : null;

  if (!transactionCode || !amount) {
    return {
      success: false,
      error: "Couldn't recognize this as an M-Pesa confirmation message. Please paste the full text exactly as received."
    };
  }

  // --- Paybill: "sent to BUSINESS NAME for account ACCOUNT on ..." ---
  let m = text.match(/sent to\s+(.+?)\s+for account\s+(\S+)\s+on/i);
  if (m) {
    return {
      success: true,
      method: "paybill",
      transactionCode,
      amount,
      paidAtRaw,
      recipientName: m[1].trim(),
      accountNumber: m[2].trim(),
      rawMessage: text
    };
  }

  // --- Send Money: "sent to NAME 07XXXXXXXX on ..." ---
  m = text.match(/sent to\s+(.+?)\s+(0\d{9}|\+?254\d{9})\s+on/i);
  if (m) {
    return {
      success: true,
      method: "phone",
      transactionCode,
      amount,
      paidAtRaw,
      recipientName: m[1].trim(),
      recipientPhone: normalizePhone(m[2].trim()),
      rawMessage: text
    };
  }

  // --- Till / Buy Goods: "paid to MERCHANT NAME on ..." ---
  m = text.match(/paid to\s+(.+?)\.?\s+on/i);
  if (m) {
    return {
      success: true,
      method: "till",
      transactionCode,
      amount,
      paidAtRaw,
      recipientName: m[1].trim(),
      rawMessage: text
    };
  }

  return {
    success: false,
    error: "Recognized this as an M-Pesa message, but couldn't tell if it was Paybill, Till, or Send Money. Please check the pasted text."
  };
}

function normalizePhone(raw) {
  let digits = (raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("0")) digits = "254" + digits.slice(1);
  return digits;
}

// Cross-checks a parsed payment against a landlord's registered payment
// profile. Returns true if it looks legitimate, false if something is
// off (wrong till, wrong paybill, wrong phone) and should be flagged for
// extra scrutiny before approval.
function checkRecipientMatch(parsed, landlord) {
  if (!parsed || !landlord) return false;

  if (parsed.method === "paybill" && landlord.paymentMethod === "paybill") {
    const nameMatches = fuzzyNameMatch(parsed.recipientName, landlord.name || landlord.businessName);
    const accountMatches = !landlord.accountHint || parsed.accountNumber === landlord.accountHint;
    return nameMatches && accountMatches;
  }

  if (parsed.method === "till" && landlord.paymentMethod === "till") {
    return fuzzyNameMatch(parsed.recipientName, landlord.businessName || landlord.name);
  }

  if (parsed.method === "phone" && landlord.paymentMethod === "phone") {
    const phoneMatches = landlord.phoneNumber && normalizePhone(landlord.phoneNumber) === parsed.recipientPhone;
    const nameMatches = fuzzyNameMatch(parsed.recipientName, landlord.registeredName || landlord.name);
    return phoneMatches || nameMatches;
  }

  // Method itself doesn't match what's on file for this landlord.
  return false;
}

function fuzzyNameMatch(a, b) {
  if (!a || !b) return false;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}
