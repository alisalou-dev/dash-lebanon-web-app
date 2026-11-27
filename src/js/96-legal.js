/* =========================================================
   LEGAL PAGES: Terms, Delivery, Returns & Refunds, Points & Coupons, AI notice
   Routes: /terms  /delivery-policy  /returns-policy  /points-terms  /ai-notice
   Values (delivery fee, cancel window, points rates) are read from Store Settings when present.
========================================================= */
(function () {
  var UPDATED = '22 November 2026';
  var PAGES = {
    'terms': { title: 'Terms & Conditions', intro: 'The rules for using the site and buying from us.' },
    'delivery-policy': { title: 'Delivery Policy', intro: 'Where, when and how we deliver your order.' },
    'returns-policy': { title: 'Returns & Refunds', intro: 'What you can return and how it works.' },
    'points-terms': { title: 'Points & Coupons Terms', intro: 'How loyalty points, coupons and offers work.' },
    'ai-notice': { title: 'AI Assistant Notice', intro: 'What to know when you use our AI and voice assistants.' }
  };
  window.DL_LEGAL = PAGES;

  function brand() { return esc((S.settings || {}).store_name || 'Dash Lebanon'); }
  function wa() { return String((S.settings || {}).whatsapp_number || '').replace(/\D/g, ''); }
  function money(n) { return '$' + (+n || 0).toFixed(2).replace(/\.00$/, ''); }
  function contact() {
    var email = String((S.settings || {}).contact_email || '').trim();
    return '<ul>' + (email ? '<li>Email: <a href="mailto:' + esc(email) + '">' + esc(email) + '</a></li>' : '') +
      (wa() ? '<li>WhatsApp: <a href="https://wa.me/' + wa() + '" target="_blank" rel="noopener noreferrer">+' + wa() + '</a></li>' : '') +
      '<li>Or use the <a href="/contact" onclick="event.preventDefault();nav(\'contact\')">contact form</a>.</li></ul>';
  }
  function sec(id, title, body) { return '<section class="pp-sec" id="pp-' + id + '"><h2>' + title + '</h2>' + body + '</section>'; }
  function crossLinks(skip) {
    var links = [['terms', 'Terms'], ['privacy-policy', 'Privacy'], ['delivery-policy', 'Delivery'], ['returns-policy', 'Returns'], ['points-terms', 'Points & coupons'], ['ai-notice', 'AI notice']];
    return '<nav class="pp-toc" aria-label="Related policies">' + links.filter(function (l) { return l[0] !== skip; }).map(function (l) {
      return '<button type="button" onclick="nav(\'' + l[0] + '\')">' + l[1] + '</button>';
    }).join('') + '</nav>';
  }

  var BODY = {
    'terms': function () {
      var b = brand();
      return [
        sec('accept', '1. Acceptance', '<p>By browsing ' + b + ', creating an account or placing an order you agree to these Terms and to our <a onclick="nav(\'privacy-policy\')">Privacy Policy</a>, <a onclick="nav(\'delivery-policy\')">Delivery Policy</a> and <a onclick="nav(\'returns-policy\')">Returns &amp; Refunds</a> policy. If you do not agree, please do not use the site.</p>'),
        sec('who', '2. Who can use the site', '<p>Accounts are for people aged 18 or older. You must give correct information and keep your password private. You are responsible for activity on your account. Placing an order without an account is allowed; you can track it with the order number and phone number.</p>'),
        sec('products', '3. Products and prices', '<p>We try to show products, photos, descriptions and prices accurately. Colors may look slightly different on your screen. Prices are shown in US dollars with an approximate Lebanese pound equivalent that depends on the exchange rate set by the store and can change. Stock is limited and not guaranteed until we confirm your order.</p><p>If a price or description is clearly wrong, we may correct it or cancel the order and tell you before delivery. You will not be charged for a cancelled order.</p>'),
        sec('orders', '4. Orders', '<p>Sending an order is an offer to buy. We accept it when our team confirms it by phone, WhatsApp, email or in the app, or when we dispatch it. We may refuse or cancel an order for reasons such as: unavailable stock, wrong or unreachable contact details, an address outside our delivery area, suspected fraud or abuse, or repeated failed deliveries.</p>'),
        sec('payment', '5. Payment', '<p>Payment is <b>cash on delivery</b>. You pay the courier the total shown on your order (items + delivery, minus any coupon). We do not collect card details on the site.</p>'),
        sec('cancel', '6. Cancelling an order', '<p>You can cancel from <b>My Orders</b> before the order is delivered. Orders cancelled within ' + ((S.settings || {}).free_cancel_hours || 24) + ' hours of being placed are free to cancel. After that window, a cancellation fee of ' + money((S.settings || {}).cancel_fee) + ' may apply and our team will contact you. See also the <a onclick="nav(\'returns-policy\')">Returns &amp; Refunds</a> policy.</p>'),
        sec('use', '7. Acceptable use', '<ul><li>Do not abuse, harass or threaten staff, couriers or other customers.</li><li>Do not place fake or prank orders.</li><li>Do not try to break, scrape, overload or gain unauthorized access to the site, other accounts or our systems.</li><li>Do not misuse coupons, points or offers (for example by creating several accounts to get the same benefit).</li></ul><p>We may suspend or delete accounts that break these rules.</p>'),
        sec('reviews', '8. Reviews and messages', '<p>Reviews and messages you send must be honest and lawful. By posting a review you allow us to display it on the site. We may remove content that is abusive, misleading or unlawful.</p>'),
        sec('ip', '9. Our content', '<p>The site design, logo, text and images belong to ' + b + ' or its licensors. You may not copy or reuse them commercially without written permission.</p>'),
        sec('liability', '10. Liability', '<p>We provide the site and products with reasonable care, but we cannot promise the site will always be available or free of errors. To the extent allowed by law, we are not liable for indirect or consequential losses, or for delays caused by events outside our control (road closures, security situations, power or network outages, strikes). Nothing in these Terms removes rights you have under Lebanese consumer protection law (Law No. 659/2005) that cannot be waived.</p>'),
        sec('law', '11. Governing law', '<p>These Terms are governed by the laws of Lebanon. Disputes that cannot be settled by talking to us first fall under the competent Lebanese courts.</p>'),
        sec('changes', '12. Changes', '<p>We may update these Terms. The date at the top shows the latest version. Using the site after a change means you accept it. Orders already placed follow the Terms that applied when you placed them.</p>'),
        sec('contact', '13. Contact', contact())
      ].join('');
    },
    'delivery-policy': function () {
      var fee = money(typeof cartDelivery === 'function' && S.cart && S.cart.length ? cartDelivery() : 4);
      return [
        sec('area', '1. Where we deliver', '<p>We deliver to addresses in Lebanon. If your area is not covered, our team will tell you after you place the order and you will not be charged.</p>'),
        sec('fee', '2. Delivery fee', '<p>The delivery fee is shown at checkout before you confirm. It is currently <b>' + fee + '</b> per order. Any change to the fee is shown at checkout and on your invoice.</p>'),
        sec('time', '3. Delivery time', '<p>After confirmation we prepare your order and the courier contacts you before arriving. Delivery times are estimates, not guarantees. Delays can happen because of traffic, weather, road closures, the security situation or high demand.</p>'),
        sec('pay', '4. Payment on delivery', '<p>Please have the exact amount ready when possible. Check the parcel in front of the courier and tell us right away about any visible damage or missing item.</p>'),
        sec('address', '5. Your address and phone', '<p>You are responsible for giving a complete address (city, district, street/building, floor) and a phone number that answers. You can share your location to help the courier, but you stay in control of the final address. Extra delivery attempts caused by a wrong address or unreachable phone may lead to cancellation.</p>'),
        sec('failed', '6. If nobody receives the order', '<p>The courier will try to reach you. If you cannot be reached or refuse the order without a valid reason, we may cancel it. Repeated failed deliveries may lead us to refuse future cash-on-delivery orders from the same account or phone number.</p>'),
        sec('track', '7. Tracking', '<p>Follow your order from <b>My Orders</b>, or use the order number and phone number to track without an account. Statuses: pending, confirmed, processing, shipping, delivered, cancelled.</p>'),
        sec('contact', '8. Contact', contact())
      ].join('');
    },
    'returns-policy': function () {
      return [
        sec('check', '1. Check on delivery', '<p>Please open and check your order when it arrives. Tell us <b>the same day</b> (WhatsApp or the contact form) if an item is damaged, defective, wrong or missing, and include a photo.</p>'),
        sec('eligible', '2. What can be returned or replaced', '<ul><li>Items that arrived damaged or defective.</li><li>Items that are different from what you ordered.</li><li>Missing items from your order.</li></ul><p>Requests should be made within <b>48 hours</b> of delivery. Items must be unused, in original packaging with all accessories.</p>'),
        sec('not', '3. What cannot be returned', '<ul><li>Opened or used beauty, personal-care and hygiene products, for safety and hygiene reasons (unless defective).</li><li>Food and consumable items once opened.</li><li>Items damaged by misuse, or without original packaging.</li><li>Items marked as final sale or clearance on the product page.</li></ul>'),
        sec('how', '4. How to request', '<p>Contact us with your order number, the item, the reason and a photo. We will tell you whether we can replace, repair or refund it, and arrange pick-up or delivery of the replacement.</p>' + contact()),
        sec('refund', '5. Refunds', '<p>Because payment is cash on delivery, approved refunds are given in cash on pick-up or by another method we agree with you. Delivery fees are refunded only if the problem was our mistake (wrong, damaged or defective item).</p>'),
        sec('cancel', '6. Cancelling before delivery', '<p>You can cancel an order from <b>My Orders</b> before it is delivered. A cancellation fee of ' + money((S.settings || {}).cancel_fee) + ' may apply after ' + ((S.settings || {}).free_cancel_hours || 24) + ' hours. See the <a onclick="nav(\'terms\')">Terms</a>.</p>'),
        sec('law', '7. Your legal rights', '<p>This policy does not limit rights you have under Lebanese consumer protection law, including for defective goods.</p>')
      ].join('');
    },
    'points-terms': function () {
      var s = S.settings || {};
      var rate = +s.points_redeem_per_dollar || 100, min = +s.points_min_redeem || 500, days = +s.points_coupon_days || 30;
      return [
        sec('earn', '1. Earning points', '<p>Registered customers earn loyalty points on eligible delivered orders. Points are added after the order is delivered, not when it is placed. Points are not earned on cancelled or returned orders, and may be removed if an order is cancelled or refunded.</p>'),
        sec('tiers', '2. Tiers', '<p>Your tier (Bronze, Silver, Gold, Platinum) depends on your points and can give extra benefits shown on the My Points page. We may change tiers and benefits with notice on the site.</p>'),
        sec('redeem', '3. Redeeming points', '<p>Points can be exchanged for a discount coupon at about ' + rate + ' points = $1, with a minimum of ' + min + ' points. The coupon works <b>once</b>, for whoever uses it first, and expires after ' + days + ' days. Points have no cash value, cannot be sold or transferred, and are not refundable for money.</p>'),
        sec('coupons', '4. Coupons and offers', '<p>Coupon codes have their own conditions (value, minimum order, expiry, usage limit) shown with the offer. Only one coupon applies per order unless stated. Expired or used coupons cannot be restored. Discounts apply to products, not delivery, unless stated.</p>'),
        sec('abuse', '5. Misuse', '<p>We may cancel points, coupons or orders and close accounts if we find abuse, such as fake orders, multiple accounts for the same benefit, or exploiting a technical error.</p>'),
        sec('changes', '6. Changes and ending the program', '<p>We may change or end the points program, or points rates, with reasonable notice on the site. If your account is deleted, its points are lost.</p>'),
        sec('contact', '7. Contact', contact())
      ].join('');
    },
    'ai-notice': function () {
      return [
        sec('what', '1. What the assistants are', '<p>The site has a text <b>AI shopping assistant</b> and a <b>live voice assistant</b>. They are automated programs powered by third-party AI providers, not human staff. You can talk to a human any time through <a onclick="nav(\'chat\')">Chat with a specialist</a> or WhatsApp.</p>'),
        sec('mistakes', '2. Answers can be wrong', '<p>The assistants can make mistakes about products, prices, stock, delivery times or policies. Treat their answers as help, not a promise. The price and details on the product page, at checkout and on your confirmed order are the ones that count.</p>'),
        sec('orders', '3. Orders placed through the assistant', '<p>An order started with the assistant is a request. It is only confirmed after our team checks it with you. Check the name, phone, address and items before you accept.</p>'),
        sec('data', '4. What is sent to the AI provider', '<p>Your messages (and your voice audio, if you use the live voice feature) are sent to the AI provider to produce replies. Do not share ID numbers, card numbers, passwords or other sensitive information. See the <a onclick="nav(\'privacy-policy\')">Privacy Policy</a> sections 5 and 6.</p>'),
        sec('voice', '5. Microphone', '<p>The live voice assistant asks for microphone permission and listens only while it is active. You can stop it or remove the permission any time in your browser settings.</p>'),
        sec('use', '6. Please use it fairly', '<p>Do not use the assistants to produce harmful, abusive or unlawful content, or to try to break the site. We may limit or block abusive use.</p>'),
        sec('contact', '7. Contact', contact())
      ].join('');
    }
  };

  window.pLegal = function (key) {
    var meta = PAGES[key] || PAGES.terms;
    var inner = (BODY[key] || BODY.terms)();
    var toc = (inner.match(/<section class="pp-sec" id="pp-[^"]+"><h2>[^<]+/g) || []).map(function (m) {
      var id = m.match(/id="pp-([^"]+)"/)[1], t = m.replace(/.*<h2>/, '').replace(/^\d+\.\s*/, '');
      return '<button type="button" onclick="document.getElementById(\'pp-' + id + '\').scrollIntoView({behavior:\'smooth\',block:\'start\'})">' + t + '</button>';
    }).join('');
    return '<div class="page pp-page" style="max-width:760px"><button class="back-link" onclick="goBack()">← Back</button>' +
      '<div class="hero"><div class="hero-in"><div class="hero-eyebrow">Legal</div><h1 style="font-size:1.7rem">' + meta.title + '</h1><p>' + meta.intro + '</p></div></div>' +
      '<div class="card pp-card"><p class="pp-meta">Last updated: ' + UPDATED + '</p><nav class="pp-toc" aria-label="Contents">' + toc + '</nav>' + inner +
      '<h2 style="font-size:.95rem;margin:22px 0 4px">Other policies</h2>' + crossLinks(key) +
      '<p class="pp-meta" style="margin-top:14px">These texts are general information. ' + brand() + ' should have them reviewed by a Lebanese lawyer.</p></div></div>';
  };
})();
