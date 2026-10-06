// Mail lezen en beantwoorden.
//
// Drie bibliotheken erbij op een project dat er tot nu toe nul had. Dat is
// een bewuste keuze: een IMAP-client met de hand schrijven is een maand werk
// en een jaar onderhoud, en je wilt niet dat je mailbox afhangt van mijn
// eerste poging tot een MIME-parser.
//
// De verbinding gaat open, doet zijn werk en gaat weer dicht. Bij een paar
// berichten per dag is dat eenvoudiger en veiliger dan een verbinding die
// uren openstaat en stilletjes kan sneuvelen.
//
// Niets uit een bericht wordt gelogd. Een foutmelding bevat nooit de inhoud.
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';

const ADRES = process.env.MAIL_ADRES || '';
const WACHTWOORD = process.env.MAIL_WACHTWOORD || '';
const BASIS = process.env.MAIL_HOST || 'transip.email';

export const mailKan = Boolean(ADRES && WACHTWOORD);

const imapInstellingen = {
  host: `imap.${BASIS}`,
  port: 993,
  secure: true,
  auth: { user: ADRES, pass: WACHTWOORD },
  logger: false            // anders staat je mailverkeer in de serverlogboeken
};

async function metPostvak(doen) {
  const client = new ImapFlow(imapInstellingen);
  await client.connect();
  const slot = await client.getMailboxLock('INBOX');
  try {
    return await doen(client);
  } finally {
    slot.release();
    await client.logout().catch(() => client.close());
  }
}

const kort = (t, n) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
};

const wie = (adres) => {
  if (!adres?.value?.length) return { naam: '', adres: '' };
  const a = adres.value[0];
  return { naam: a.name || '', adres: a.address || '' };
};

/** De laatste berichten, nieuwste eerst. Alleen de envelop, geen inhoud —
 *  dat scheelt verkeer en je hoeft niet alles te downloaden om een lijst te
 *  kunnen tonen. */
export async function lijst({ aantal = 30 } = {}) {
  return metPostvak(async (client) => {
    const totaal = client.mailbox.exists;
    if (!totaal) return { berichten: [], totaal: 0, ongelezen: 0 };

    const vanaf = Math.max(1, totaal - aantal + 1);
    const berichten = [];
    for await (const b of client.fetch(`${vanaf}:*`, { uid: true, envelope: true, flags: true, size: true })) {
      const van = wie(b.envelope?.from);
      berichten.push({
        uid: b.uid,
        van: van.naam || van.adres,
        vanAdres: van.adres,
        onderwerp: kort(b.envelope?.subject || '(geen onderwerp)', 120),
        op: b.envelope?.date || null,
        gelezen: b.flags?.has('\\Seen') || false,
        beantwoord: b.flags?.has('\\Answered') || false,
        grootte: b.size || 0
      });
    }
    berichten.reverse();
    return {
      berichten,
      totaal,
      ongelezen: berichten.filter((b) => !b.gelezen).length
    };
  });
}

/** Eén bericht met inhoud. Html wordt niet doorgegeven: dat zou je eigen
 *  beheerscherm overleveren aan de opmaak - en scripts - van de afzender.
 *  De platte tekst is genoeg om te lezen en te beantwoorden. */
export async function bericht(uid) {
  return metPostvak(async (client) => {
    const bron = await client.download(String(uid), undefined, { uid: true });
    if (!bron?.content) return null;
    const ontleed = await simpleParser(bron.content);
    const van = { naam: ontleed.from?.value?.[0]?.name || '', adres: ontleed.from?.value?.[0]?.address || '' };
    return {
      uid: Number(uid),
      van: van.naam || van.adres,
      vanAdres: van.adres,
      aan: (ontleed.to?.value || []).map((a) => a.address).join(', '),
      onderwerp: ontleed.subject || '(geen onderwerp)',
      op: ontleed.date || null,
      tekst: ontleed.text || '(dit bericht heeft geen platte tekst, alleen opmaak)',
      berichtId: ontleed.messageId || null,
      referenties: ontleed.references || null,
      bijlagen: (ontleed.attachments || []).map((a) => ({
        naam: a.filename || 'naamloos',
        type: a.contentType,
        grootte: a.size
      }))
    };
  });
}

export async function markeer(uid, gelezen = true) {
  return metPostvak(async (client) => {
    if (gelezen) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    else await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
    return { ok: true };
  });
}

/** Antwoorden. De kopregels In-Reply-To en References zorgen dat het
 *  antwoord in de mailbox van de ontvanger onder het oorspronkelijke bericht
 *  komt te hangen in plaats van als los mailtje. */
export async function antwoord({ uid, tekst }) {
  const origineel = await bericht(uid);
  if (!origineel) throw new Error('Dat bericht bestaat niet meer.');
  if (!origineel.vanAdres) throw new Error('Dit bericht heeft geen afzender om naar te antwoorden.');

  const post = nodemailer.createTransport({
    host: `smtp.${BASIS}`,
    port: 465,
    secure: true,
    auth: { user: ADRES, pass: WACHTWOORD }
  });

  const onderwerp = /^re:/i.test(origineel.onderwerp)
    ? origineel.onderwerp
    : `Re: ${origineel.onderwerp}`;

  const aanhaling = String(origineel.tekst || '')
    .split('\n').slice(0, 40).map((r) => '> ' + r).join('\n');

  await post.sendMail({
    from: ADRES,
    to: origineel.vanAdres,
    subject: onderwerp,
    text: `${tekst}\n\n\nOp ${origineel.op ? new Date(origineel.op).toLocaleString('nl-NL') : 'een eerder moment'} schreef ${origineel.van}:\n${aanhaling}\n`,
    inReplyTo: origineel.berichtId || undefined,
    references: [origineel.referenties, origineel.berichtId].flat().filter(Boolean).join(' ') || undefined
  });

  // beantwoord zetten, zodat je in de lijst ziet wat al afgehandeld is
  await metPostvak(async (client) => {
    await client.messageFlagsAdd(String(uid), ['\\Answered', '\\Seen'], { uid: true });
  }).catch(() => { /* het antwoord is verstuurd; de vlag is bijzaak */ });

  return { ok: true, naar: origineel.vanAdres, onderwerp };
}
