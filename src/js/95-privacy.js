/* =========================================================
   PRIVACY POLICY page  (route: /privacy-policy, alias /privacy)
   Contact details are read from Store Settings (contact_email, whatsapp_number).
========================================================= */
window.pPrivacy = function () {
  const st = S.settings || {};
  const brand = esc(st.store_name || 'Dash Lebanon');
  const email = (st.contact_email || '').trim();
  const waRaw = String(st.whatsapp_number || '').replace(/\D/g, '');
  const contactLines =
    (email ? `<li>Email: <a href="mailto:${esc(email)}">${esc(email)}</a></li>` : '') +
    (waRaw ? `<li>WhatsApp: <a href="https://wa.me/${waRaw}" target="_blank" rel="noopener noreferrer">+${waRaw}</a></li>` : '') +
    `<li>Or use the <a href="/contact" onclick="event.preventDefault();nav('contact')">contact form</a> on this site.</li>`;
  const sec = (id, title, body) =>
    `<section class="pp-sec" id="pp-${id}"><h2>${title}</h2>${body}</section>`;
  const toc = [
    ['who', 'Who we are'], ['collect', 'Information we collect'], ['use', 'How we use your information'],
    ['location', 'Location'], ['voice', 'Voice notes & voice assistant'], ['ai', 'AI shopping assistant'],
    ['share', 'Who we share it with'], ['storage', 'Cookies & local storage'], ['retention', 'How long we keep it'],
    ['security', 'Security'], ['rights', 'Your choices & rights'], ['age', 'Age requirement'],
    ['changes', 'Changes to this policy'], ['contact', 'Contact us']
  ].map(t => `<button type="button" onclick="document.getElementById('pp-${t[0]}').scrollIntoView({behavior:'smooth',block:'start'})">${t[1]}</button>`).join('');

  return `<div class="page pp-page" style="max-width:760px">
  <button class="back-link" onclick="goBack()">← Back</button>
  <div class="hero"><div class="hero-in">
    <div class="hero-eyebrow">Legal</div>
    <h1 style="font-size:1.7rem">Privacy Policy</h1>
    <p>How ${brand} collects, uses and protects your information.</p>
  </div></div>
  <div class="card pp-card">
    <p class="pp-meta">Last updated: 22 November 2026</p>
    <p>This Privacy Policy explains what personal information ${brand} ("we", "us") collects when you browse our website, create an account, chat with us or place an order, and what we do with it. By using the site you confirm that you have read this policy.</p>
    <nav class="pp-toc" aria-label="Contents">${toc}</nav>

    ${sec('who', '1. Who we are', `<p>${brand} is an online store that delivers everyday products across Lebanon, with cash on delivery. We are the party responsible for the personal information described in this policy. Contact details are in section 14.</p>`)}

    ${sec('collect', '2. Information we collect', `
      <p><b>Account details.</b> When you register: first and last name, username, email address, phone number, date of birth (used only to confirm you are 18 or older) and a password. Your password is handled by our authentication provider and is never visible to us in readable form.</p>
      <p><b>Order and delivery details.</b> Name, phone number (and a second phone number if you give one), city, district, full address, floor, delivery notes, the items you ordered, prices, coupons used and order status. You can also track an order without an account by using the order number and phone number.</p>
      <p><b>Delivery location.</b> If you choose to share it: GPS coordinates and the address we derive from them, or the address you type manually (see section 4).</p>
      <p><b>Messages.</b> What you send through the contact form, the chat with our team, and the AI assistant, including optional voice notes (see sections 5 and 6).</p>
      <p><b>Loyalty and activity.</b> Points balance and history, coupons, favorites, and product reviews.</p>
      <p><b>Technical data.</b> Basic information that any website receives, such as IP address, browser type and device, plus failed-login counts used to protect accounts from guessing attacks.</p>
      <p>We do not collect payment card details. Payment is cash on delivery.</p>`)}

    ${sec('use', '3. How we use your information', `<ul>
      <li>To create and manage your account and sign you in securely.</li>
      <li>To process, deliver, track, and, where needed, cancel or support your orders.</li>
      <li>To contact you about an order or reply to your messages (by phone, WhatsApp, email or in-app chat).</li>
      <li>To send account emails such as verification codes and password resets.</li>
      <li>To run points, coupons and offers.</li>
      <li>To keep the site safe: detect abuse, limit repeated failed logins and fix problems.</li>
      <li>To improve products, content and the shopping experience.</li>
      <li>To meet legal and accounting obligations.</li></ul>
      <p>We do not sell your personal information.</p>`)}

    ${sec('location', '4. Location', `<p>We ask for permission before using your device location. If you allow it, we read your position once to suggest your delivery address, and ask you to confirm or edit it. We do not track you continuously. You can decline and enter your address manually, and you can withdraw the permission at any time in your browser or device settings. To turn coordinates into a readable address we may send them to a map and geocoding service (see section 7). We save your last confirmed delivery address so you do not have to retype it.</p>`)}

    ${sec('voice', '5. Voice notes & voice assistant', `<p><b>Voice notes.</b> If you record a voice note in the contact form, the recording is uploaded to our private storage and is available only to authorized store staff. You can clear a recording before sending it.</p>
      <p><b>Live voice assistant.</b> If you use the live voice feature, your browser asks for microphone permission, and your audio is streamed to a third-party AI voice service to produce replies. Use it only if you are comfortable with that. The microphone is used only while the feature is active.</p>`)}

    ${sec('ai', '6. AI shopping assistant', `<p>Our assistant answers questions and can help place an order. The messages you type (and the order details you enter in the assistant) are processed by us and sent to an AI language-model provider to generate replies. Please do not share sensitive information such as ID numbers or passwords in any chat. Assistant replies are automated and may contain mistakes; we confirm orders before delivery.</p>`)}

    ${sec('share', '7. Who we share it with', `<p>We share information only as needed to run the store, with:</p><ul>
      <li><b>Hosting and database providers</b> (Supabase for accounts, database, file storage and server functions; Vercel for the website).</li>
      <li><b>AI providers</b> that power the text assistant and the live voice assistant.</li>
      <li><b>Map / geocoding services</b> (such as OpenStreetMap) to convert coordinates to an address.</li>
      <li><b>Email delivery services</b> that send verification and password-reset emails.</li>
      <li><b>Google Fonts</b>, which serves the site's typefaces and therefore receives your IP address when fonts load.</li>
      <li><b>Delivery staff</b>, who receive the name, phone and address needed to deliver your order.</li>
      <li><b>Authorities</b>, when we are legally required to.</li></ul>
      <p>These providers may process data outside Lebanon. We only share what is necessary for the service they provide.</p>`)}

    ${sec('storage', '8. Cookies & local storage', `<p>We do not use advertising cookies. The site stores a few items in your browser so it works properly: your sign-in session, your shopping cart, light/dark mode, your last saved delivery location and location-prompt choice, recent searches, and an anonymous session ID for the assistant. You can clear these in your browser settings, but you may be signed out and your cart emptied.</p>`)}

    ${sec('retention', '9. How long we keep it', `<p>We keep account and order information for as long as your account is active and as needed for delivery, support, disputes and legal or accounting requirements. Contact messages, chat messages and voice notes are kept for up to <b>90 days</b> after your request is closed, unless needed for a dispute. Failed-login counters are kept for a short period only. Order records are kept as long as accounting law requires. When information is no longer needed, we delete or anonymize it.</p>`)}

    ${sec('security', '10. Security', `<p>We use access controls on our database, encrypted connections (HTTPS), restricted staff access and protection against repeated login attempts. No online service is perfectly secure, so please choose a strong password and keep it private. If you suspect unauthorized access to your account, contact us right away.</p>`)}

    ${sec('rights', '11. Your choices & rights', `<p>Subject to applicable Lebanese law, including the Law on Electronic Transactions and Personal Data (Law No. 81/2018), you may ask us to:</p><ul>
      <li>give you a copy of the personal information we hold about you;</li>
      <li>correct information that is wrong or out of date;</li>
      <li>delete your account and related data (we may keep what the law requires us to keep, such as order records);</li>
      <li>stop using your information for a purpose you object to.</li></ul>
      <p>You can edit most account details yourself in <b>My Account</b>, where you can also <b>download a copy of your data</b> and <b>delete your account</b>. Deleting your account removes your profile, wishlist, addresses, points and chats; past orders are kept without a link to your account for our records. For anything else, contact us using the details below and we will reply as soon as we can.</p>`)}

    ${sec('age', '12. Age requirement', `<p>Accounts are for people aged 18 or older. We do not knowingly collect personal information from children. If you believe a child has given us information, contact us and we will delete it.</p>`)}

    ${sec('changes', '13. Changes to this policy', `<p>See also our <a onclick="nav('terms')">Terms</a>, <a onclick="nav('delivery-policy')">Delivery Policy</a>, <a onclick="nav('returns-policy')">Returns &amp; Refunds</a> and <a onclick="nav('ai-notice')">AI Notice</a>. We may update this policy from time to time. The "Last updated" date at the top shows when it last changed. If we make important changes, we will let you know on the site.</p>`)}

    ${sec('contact', '14. Contact us', `<p>Questions or requests about your privacy:</p><ul>${contactLines}</ul>`)}
  </div></div>`;
};
