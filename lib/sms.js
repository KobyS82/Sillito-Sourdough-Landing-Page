const SID   = () => process.env.TWILIO_ACCOUNT_SID;
const TOKEN = () => process.env.TWILIO_AUTH_TOKEN;
const FROM  = () => process.env.TWILIO_PHONE_NUMBER;

async function sendSMS({ to, message }) {
  if (!SID() || !TOKEN() || !FROM()) {
    console.warn('[SMS] Twilio not configured — skipping');
    return null;
  }
  const auth = Buffer.from(`${SID()}:${TOKEN()}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${SID()}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: FROM(), To: to, Body: message }).toString(),
    }
  );
  if (!res.ok) console.error('[SMS] Twilio error:', await res.text());
  return res.json().catch(() => null);
}

module.exports = { sendSMS };
