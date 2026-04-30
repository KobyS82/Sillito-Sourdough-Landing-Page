const { select, update } = require('../lib/db');
const { sendEmail, templates } = require('../lib/email');
const { sendSMS } = require('../lib/sms');

const ADMIN_PW = process.env.ADMIN_PASSWORD;
const SITE_URL = process.env.SITE_URL || '';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password, type, subject, message, ctaUrl, notifyWaitlist } = req.body || {};
  if (password !== ADMIN_PW) return res.status(401).json({ error: 'Unauthorized' });

  const results = { emailsSent: 0, smsSent: 0, waitlistNotified: 0, errors: [] };

  try {
    if (notifyWaitlist) {
      // Notify waitlist customers that spots opened up
      const waitlistEntries = await select(
        'waitlist',
        '?notified=eq.false&select=*,customers(*)'
      );
      const weekData = await select('weeks', `?id=eq.${notifyWaitlist}`);
      const week = weekData?.[0];
      if (week && waitlistEntries?.length) {
        for (const entry of waitlistEntries) {
          try {
            await sendEmail({
              to: entry.customers.email,
              subject: 'A spot just opened — Sillito Sourdough',
              html: templates.waitlistNotification(entry.customers, week, SITE_URL || ctaUrl),
            });
            if (entry.customers.sms_opt_in && entry.customers.phone) {
              await sendSMS({
                to: entry.customers.phone,
                message: `Good news! A spot opened for ${week.label} at Sillito Sourdough. Grab it: ${SITE_URL || ctaUrl}`,
              });
            }
            await update('waitlist', `id=eq.${entry.id}`, { notified: true });
            results.waitlistNotified++;
          } catch (e) {
            results.errors.push(`Waitlist notify ${entry.customers?.email}: ${e.message}`);
          }
        }
      }
      return res.status(200).json(results);
    }

    // Regular blast
    const customers = await select('customers', '?order=created_at.asc');
    const emailList = customers?.filter(c => c.email_opt_in) || [];
    const smsList   = customers?.filter(c => c.sms_opt_in && c.phone) || [];

    if (type === 'email' || type === 'both') {
      for (const c of emailList) {
        try {
          await sendEmail({
            to: c.email,
            subject,
            html: templates.blast(c, subject, message, ctaUrl || SITE_URL),
          });
          results.emailsSent++;
        } catch (e) {
          results.errors.push(`Email ${c.email}: ${e.message}`);
        }
      }
    }

    if (type === 'sms' || type === 'both') {
      for (const c of smsList) {
        try {
          await sendSMS({ to: c.phone, message });
          results.smsSent++;
        } catch (e) {
          results.errors.push(`SMS ${c.phone}: ${e.message}`);
        }
      }
    }

    return res.status(200).json(results);
  } catch (e) {
    console.error('[notify] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
