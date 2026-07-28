(() => {
  // Flip to true (and redeploy) once all commission spots are filled.
  // The survey stays wired up underneath — this just swaps the visible view.
  const SPOTS_FILLED = true;

  // ── form-relay (github.com/TheBerlinMan/tnma-form-relay) ──────────────────
  // Both ids must exist in the relay's src/config/forms.ts, and this site's
  // origin must be in each one's allowedOrigins or the POST 403s. See README.
  const RELAY_BASE = 'https://form-relay-eta.vercel.app/f';
  const COMMISSION_FORM_ID = 'tnma-bag-commission';
  const WAITLIST_FORM_ID = 'tnma-bag-waitlist';

  // Per tattoo embroidery, on top of the $50 base deposit.
  const TATTOO_PRICE = 25;

  const surveyView = document.getElementById('surveyView');
  const closedView = document.getElementById('closedView');
  if (SPOTS_FILLED) {
    surveyView.hidden = true;
    closedView.hidden = false;
  }

  /**
   * POSTs to form-relay as JSON. The relay only reads string values — an array
   * or number is coerced to '' and silently dropped — so every value must
   * already be a string by the time it gets here.
   *
   * Resolves { ok: true } on success, { ok: false, errors?, message } otherwise.
   * Note the relay returns a fake 200 for spam/rate-limit/duplicate rejections
   * on purpose, so "ok" means "accepted", not "definitely emailed".
   */
  async function submitToRelay(formId, payload) {
    let res;
    try {
      res = await fetch(`${RELAY_BASE}/${formId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
    }

    if (res.ok) return { ok: true };

    if (res.status === 422) {
      let errors = {};
      try {
        ({ errors = {} } = await res.json());
      } catch { /* fall through to the generic message */ }
      return { ok: false, errors, message: 'Please check the highlighted answers and try again.' };
    }

    // 403 (origin not allowlisted) and 404 (unknown form id) are config bugs on
    // the relay side — the visitor can't fix them, so log loudly and stay vague.
    console.error(`form-relay ${formId} responded ${res.status}`);
    return { ok: false, message: "Something went wrong on my end. Please try again in a moment, or email me directly." };
  }

  // ── Cloudflare Turnstile ──────────────────────────────────────────────────
  // The relay verifies a `cf-turnstile-response` token on every submission, and
  // a submission without a valid one is dropped behind the same fake
  // `200 {"ok":true}` it uses for spam — the visitor sees a thank-you while
  // nothing arrives. Every payload below has to carry a fresh token.
  const TURNSTILE_SITE_KEY = '0x4AAAAAADi0RqimZ7HsP72J';

  // api.js is loaded async with render=explicit, so it can finish either before
  // or after this file runs. Cover both: window.turnstile already exists, or
  // the onload callback fires later.
  const turnstileWaiting = [];
  function whenTurnstileReady(fn) {
    if (window.turnstile) fn();
    else turnstileWaiting.push(fn);
  }
  window.onTurnstileLoad = () => {
    while (turnstileWaiting.length) turnstileWaiting.shift()();
  };

  /**
   * A widget that stays unrendered until its screen is actually reached. Tokens
   * are single-use and expire in ~5 minutes, which is shorter than a considered
   * pass through this deck — so rendering is deliberately late, and reset() runs
   * after every submit attempt, including failed ones where the visitor stays
   * put to retry and would otherwise resend the spent token.
   */
  function createTurnstile(containerId, onRender) {
    let widgetId = null;
    // Separate from widgetId: leaving and re-entering the review slide while
    // api.js is still loading would otherwise queue a second render into the
    // same container and stack two widgets.
    let requested = false;
    return {
      render() {
        if (requested) return;
        const container = document.getElementById(containerId);
        if (!container) return;
        requested = true;
        whenTurnstileReady(() => {
          widgetId = window.turnstile.render(container, { sitekey: TURNSTILE_SITE_KEY });
          if (onRender) onRender();
        });
      },
      /** '' while the challenge is still running, and after a reset. */
      token() {
        return (widgetId !== null && window.turnstile.getResponse(widgetId)) || '';
      },
      reset() {
        if (widgetId !== null) window.turnstile.reset(widgetId);
      },
    };
  }

  // Shown when the visitor submits before the challenge has cleared. It usually
  // settles in a second or two; if it never does (blocked script, no network to
  // Cloudflare) there's no token to be had, so point at the way out.
  const TURNSTILE_PENDING_MESSAGE =
    "Hang on — the spam check hasn't finished yet. Try again in a moment, or reload the page if it doesn't clear.";

  // ── Waitlist (shown only once SPOTS_FILLED flips) ─────────────────────────
  const waitlistForm = document.getElementById('waitlistForm');
  const waitlistConfirm = document.getElementById('waitlistConfirm');
  const waitlistError = document.getElementById('waitlistError');
  // The copy inviting a signup, replaced by the confirmation once there is one.
  const waitlistIntro = Array.from(document.querySelectorAll('.waitlist-intro'));
  if (waitlistForm) {
    const btnWaitlist = document.getElementById('btnWaitlistSubmit');
    const waitlistTurnstile = createTurnstile('waitlistTurnstile');
    // This view is the entire page when it's shown, so "when its screen is
    // reached" is right now — there's no later moment to wait for.
    if (!closedView.hidden) waitlistTurnstile.render();

    waitlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btnWaitlist.disabled) return;

      const token = waitlistTurnstile.token();
      if (!token) {
        waitlistError.textContent = TURNSTILE_PENDING_MESSAGE;
        waitlistError.hidden = false;
        return;
      }

      waitlistError.hidden = true;
      btnWaitlist.disabled = true;
      const originalText = btnWaitlist.textContent;
      btnWaitlist.textContent = 'Joining…';

      const result = await submitToRelay(WAITLIST_FORM_ID, {
        email: document.getElementById('waitlistEmail').value.trim(),
        _honey: document.getElementById('waitlistHoney').value,
        'cf-turnstile-response': token,
      });

      // Spent either way: a rejected token can't be resubmitted.
      waitlistTurnstile.reset();

      if (result.ok) {
        waitlistIntro.forEach((el) => { el.hidden = true; });
        waitlistForm.hidden = true;
        waitlistConfirm.hidden = false;
        return;
      }

      waitlistError.textContent = result.errors?.email
        ? `Email: ${result.errors.email}`
        : result.message;
      waitlistError.hidden = false;
      btnWaitlist.disabled = false;
      btnWaitlist.textContent = originalText;
    });
  }

  const slidesEl = document.getElementById('slides');
  const track = document.getElementById('slideTrack');
  const slides = Array.from(track.querySelectorAll('.slide'));
  const progress = document.getElementById('progress');
  const privacyNote = document.querySelector('.privacy-note');
  const btnBack = document.getElementById('btnBack');
  const btnNext = document.getElementById('btnNext');
  const summaryEl = document.getElementById('summary');
  // Rendered on arrival at the review slide, not at page load — see createTurnstile.
  const surveyTurnstile = createTurnstile('surveyTurnstile', () => syncSlidesHeight());

  const FIELD_LABELS = {
    fullName: 'Name',
    email: 'Email',
    phone: 'Phone',
    usage: 'Primary use',
    bagSize: 'Preferred size',
    heaviestItem: 'Heaviest item',
    specificFit: 'Needs to fit',
    favoriteColors: 'Favorite colors',
    dislikedColors: 'Colors to avoid',
    allergies: 'Fabric allergies',
    additionalPreferences: 'Additional preferences',
    instaMatch: 'Match an Insta bag',
    instaBag: 'Matched bag',
    tattoo: 'Tattoo embroidery',
    tattooPicks: 'Tattoo selections',
  };

  // form-relay reports 422 errors under the payload's field names, which differ
  // from the DOM names in a couple of places (fullName → name).
  const RELAY_FIELD_LABELS = {
    ...FIELD_LABELS,
    name: 'Name',
    tattooCount: 'Tattoo count',
    depositTotal: 'Deposit total',
  };

  const VALUE_LABELS = {
    usage: {
      groceries: 'Groceries',
      clothes: 'Clothes',
      laptop: 'Laptop / Books / Other Tech',
      'everyday-items': "The day's little things",
    },
    bagSize: {
      standard: 'Standard',
      smaller: 'Smaller',
      larger: 'Larger',
    },
    tattoo: {
      no: 'No',
      yes: 'Yes',
    },
    instaMatch: {
      no: 'No',
      yes: 'Yes',
    },
    tattooPicks: {
      'peace-sign': 'Peace sign',
      thirteen: 'XIII',
      arrows: 'Crossed arrows',
      angel: 'Angel',
      'ukraine-crest': 'Ukraine crest',
      bow: 'Bow',
      devil: 'Devil',
      'paper-plane': 'Paper plane',
    },
    instaBag: {
      'bag-1': 'Bag 1',
      'bag-2': 'Bag 2',
      'bag-3': 'Bag 3',
      'bag-4': 'Bag 4',
      'bag-5': 'Bag 5',
      'bag-6': 'Bag 6',
      'bag-7': 'Bag 7',
      'bag-8': 'Bag 8',
      'bag-9': 'Bag 9',
    },
  };

  function formatValue(key, value) {
    const labels = VALUE_LABELS[key];
    if (Array.isArray(value)) {
      return value.map((v) => (labels && labels[v]) || v).join(', ');
    }
    return (labels && labels[value]) || value;
  }

  const reviewIndex = slides.findIndex((s) => s.contains(summaryEl));
  const lastIndex = slides.length - 1;

  let current = 0;

  // Build progress dots (one per slide between the welcome page and the thank-you page)
  const dotCount = lastIndex - 1; // slides 1..lastIndex-1 get dots
  for (let i = 0; i < dotCount; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    progress.appendChild(dot);
  }
  const dots = Array.from(progress.children);

  function updateProgress() {
    const dotIndex = current - 1;
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-done', i < dotIndex);
      dot.classList.toggle('is-active', i === dotIndex);
    });
    progress.style.display = current > 0 && current < lastIndex ? 'flex' : 'none';
    privacyNote.style.display = current === 0 ? 'block' : 'none';
  }

  function requiredFieldsFor(slide) {
    return Array.from(slide.querySelectorAll('[required]'));
  }

  /**
   * The element that owns a field's invalid styling and message: the .field
   * wrapper for text inputs, the whole .option-group for radio/checkbox sets
   * (marking a single .option label would point at an arbitrary choice).
   */
  function validationAnchor(field) {
    return field.closest('.field') || field.closest('.option-group') || field.parentElement;
  }

  /** Lazily creates the message element that follows a field's anchor. */
  function messageFor(anchor) {
    let el = anchor.nextElementSibling;
    if (!el || !el.classList.contains('field-message')) {
      el = document.createElement('p');
      el.className = 'field-message';
      anchor.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function setFieldValidity(field, ok) {
    const anchor = validationAnchor(field);
    if (!anchor) return;
    anchor.classList.toggle('field--invalid', !ok);
    const msg = messageFor(anchor);
    // validationMessage is the browser's own wording ("Please fill out this
    // field"), which is localised and already familiar. Radio groups report an
    // empty string in some browsers, so keep a fallback.
    msg.textContent = ok ? '' : field.validationMessage || 'Please answer this question.';
    msg.hidden = ok;
  }

  function validateSlide(slide) {
    let firstInvalid = null;
    requiredFieldsFor(slide).forEach((field) => {
      const ok = field.checkValidity();
      setFieldValidity(field, ok);
      if (!ok && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  // Clear a message the moment the visitor fixes the answer, rather than making
  // them click Next again to find out. Delegated because only the *first* radio
  // in a group carries the `required` attribute — changing any sibling has to
  // re-check that owner.
  function clearIfNowValid(e) {
    const field = e.target;
    if (!field.name) return;
    const owner = field.hasAttribute('required')
      ? field
      : requiredFieldsFor(track).find((f) => f.name === field.name);
    if (owner && owner.checkValidity()) {
      setFieldValidity(owner, true);
      syncSlidesHeight();
    }
  }

  function collectData() {
    const data = {};
    slides.forEach((slide) => {
      slide.querySelectorAll('input, select, textarea').forEach((el) => {
        if (!el.name) return;
        if (el.type === 'checkbox') {
          if (!el.checked) return;
          (data[el.name] = data[el.name] || []).push(el.value);
          return;
        }
        if (el.type === 'radio') {
          if (!el.checked) return;
          data[el.name] = el.value;
          return;
        }
        data[el.name] = el.value.trim();
      });
    });
    return data;
  }

  function tattooCountFrom(data) {
    return data.tattoo === 'yes' && Array.isArray(data.tattooPicks) ? data.tattooPicks.length : 0;
  }

  function depositTotalFrom(data) {
    return 50 + tattooCountFrom(data) * TATTOO_PRICE;
  }

  function updateDepositSummary() {
    const depositEl = document.getElementById('depositAmount');
    if (!depositEl) return;
    const data = collectData();
    const tattooCount = tattooCountFrom(data);
    if (tattooCount > 0) {
      const tattooWord = tattooCount === 1 ? 'tattoo' : 'tattoos';
      depositEl.innerHTML = `Your deposit is <strong>$${depositTotalFrom(data)}</strong> — a $50 base, plus $${TATTOO_PRICE} for each tattoo embroidery selection (${tattooCount} ${tattooWord} selected).`;
    } else {
      depositEl.innerHTML = 'Your deposit is <strong>$50</strong>.';
    }
  }

  /**
   * Flattens the survey into the flat string map form-relay expects. Multi-selects
   * are joined into one string and slugs are swapped for their human labels, so
   * the notification email reads the same as the on-screen review.
   */
  function buildSurveyPayload(turnstileToken) {
    const data = collectData();
    const str = (key) => data[key] || '';
    const labelled = (key) => (data[key] ? formatValue(key, data[key]) : '');

    return {
      name: str('fullName'),
      email: str('email'),
      phone: str('phone'),
      usage: labelled('usage'),
      bagSize: labelled('bagSize'),
      heaviestItem: str('heaviestItem'),
      specificFit: str('specificFit'),
      favoriteColors: str('favoriteColors'),
      dislikedColors: str('dislikedColors'),
      allergies: str('allergies'),
      additionalPreferences: str('additionalPreferences'),
      instaMatch: labelled('instaMatch'),
      // Conditional answers are dropped unless their gate is a "yes", so a
      // radio left checked from an earlier pass can't leak into the email.
      instaBag: data.instaMatch === 'yes' ? labelled('instaBag') : '',
      tattoo: labelled('tattoo'),
      tattooPicks: data.tattoo === 'yes' ? labelled('tattooPicks') : '',
      tattooCount: String(tattooCountFrom(data)),
      depositTotal: String(depositTotalFrom(data)),
      _honey: str('_honey'),
      'cf-turnstile-response': turnstileToken,
    };
  }

  function renderSummary() {
    const data = collectData();
    summaryEl.innerHTML = '';
    const entries = Object.entries(FIELD_LABELS).filter(([key]) => {
      const value = data[key];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    });
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'summary-empty';
      empty.textContent = 'Nothing to review yet.';
      summaryEl.appendChild(empty);
      return;
    }
    entries.forEach(([key, label]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = formatValue(key, data[key]);
      row.append(dt, dd);
      summaryEl.appendChild(row);
    });
  }

  function updateNavLabels() {
    btnBack.classList.toggle('is-hidden', current === 0 || current === lastIndex);
    btnNext.classList.toggle('is-hidden', current === lastIndex);

    if (current === 0) {
      btnNext.textContent = 'Start Survey';
    } else if (current === reviewIndex) {
      btnNext.textContent = 'Submit request';
    } else if (current === lastIndex - 1) {
      btnNext.textContent = 'Review';
    } else {
      btnNext.textContent = 'Next';
    }
  }

  function syncSlidesHeight() {
    slidesEl.style.height = `${slides[current].offsetHeight}px`;
  }

  function goTo(index) {
    current = Math.max(0, Math.min(lastIndex, index));
    track.style.transform = `translateX(-${current * 100}%)`;
    updateProgress();
    updateNavLabels();
    if (current === reviewIndex) {
      renderSummary();
      surveyTurnstile.render();
    }
    syncSlidesHeight();
  }

  const submitError = document.getElementById('submitError');
  let isSubmitting = false;

  async function submitSurvey() {
    if (isSubmitting) return;

    const token = surveyTurnstile.token();
    if (!token) {
      submitError.textContent = TURNSTILE_PENDING_MESSAGE;
      submitError.hidden = false;
      syncSlidesHeight();
      return;
    }

    isSubmitting = true;
    submitError.hidden = true;
    btnNext.disabled = true;
    btnNext.textContent = 'Sending…';

    const result = await submitToRelay(COMMISSION_FORM_ID, buildSurveyPayload(token));

    // Spent either way: a rejected token can't be resubmitted, so hand the
    // visitor a fresh one before they retry.
    surveyTurnstile.reset();

    isSubmitting = false;
    btnNext.disabled = false;

    if (result.ok) {
      updateDepositSummary();
      goTo(current + 1);
      return;
    }

    // Stay on the review slide with the answers intact so they can retry.
    const fieldErrors = Object.entries(result.errors || {});
    submitError.textContent = fieldErrors.length
      ? `${result.message} (${fieldErrors.map(([k, v]) => `${RELAY_FIELD_LABELS[k] || k}: ${v}`).join('; ')})`
      : result.message;
    submitError.hidden = false;
    updateNavLabels();
    syncSlidesHeight();
  }

  btnNext.addEventListener('click', () => {
    if (current === lastIndex) {
      // restart
      document.querySelectorAll('input, textarea').forEach((el) => {
        // Turnstile keeps its own hidden input inside the widget container.
        if (el.closest('.turnstile')) return;
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = false;
          el.disabled = false;
        } else {
          el.value = '';
        }
      });
      document.querySelectorAll('select').forEach((el) => (el.selectedIndex = 0));
      tattooSheet.hidden = true;
      instaGallery.hidden = true;
      submitError.hidden = true;
      goTo(0);
      return;
    }
    if (current === reviewIndex) {
      submitSurvey();
      return;
    }
    advance();
  });

  /**
   * Forward navigation, gated on the current slide's required fields. Before the
   * relay was wired up a missed field cost nothing; now it comes back as a 422
   * on the very last screen, so catch it on the slide that owns the field.
   */
  function advance() {
    if (current === lastIndex) return;
    if (!validateSlide(slides[current])) {
      syncSlidesHeight();
      return;
    }
    goTo(current + 1);
  }

  btnBack.addEventListener('click', () => goTo(current - 1));

  // Swipe support
  let touchStartX = null;
  track.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const threshold = 50;
    if (dx > threshold) {
      goTo(current - 1);
    } else if (dx < -threshold) {
      // Swiping off the review slide must not skip the submit — that would land
      // the visitor on "Thank you" without anything ever reaching the relay.
      if (current === reviewIndex) {
        submitSurvey();
      } else {
        advance();
      }
    }
    touchStartX = null;
  });

  // Conditional follow-ups
  const tattooSheet = document.getElementById('tattooSheet');
  document.querySelectorAll('input[name="tattoo"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      tattooSheet.hidden = radio.value !== 'yes' || !radio.checked;
      syncSlidesHeight();
    });
  });

  const instaGallery = document.getElementById('instaGallery');
  document.querySelectorAll('input[name="instaMatch"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      instaGallery.hidden = radio.value !== 'yes' || !radio.checked;
      syncSlidesHeight();
    });
  });

  track.addEventListener('input', clearIfNowValid);
  track.addEventListener('change', clearIfNowValid);

  window.addEventListener('resize', syncSlidesHeight);

  // Tattoo picks: up to 3 total
  const tattooChecks = Array.from(document.querySelectorAll('input[name="tattooPicks"]'));
  function updateTattooCaps() {
    const checkedCount = tattooChecks.filter((c) => c.checked).length;
    tattooChecks.forEach((c) => {
      if (!c.checked) c.disabled = checkedCount >= 3;
    });
  }
  tattooChecks.forEach((c) => c.addEventListener('change', updateTattooCaps));

  // Lightbox for "click to expand" swatches
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  function openLightbox(label, src) {
    lightboxImage.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    img.alt = label;
    lightboxImage.appendChild(img);
    lightbox.hidden = false;
  }
  function closeLightbox() {
    lightbox.hidden = true;
  }
  document.querySelectorAll('.swatch-expand').forEach((btn) => {
    btn.addEventListener('click', () => openLightbox(btn.dataset.expand, btn.dataset.src));
  });
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxBackdrop').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });

  // Copy phone number for Zelle
  const btnCopyZelle = document.getElementById('btnCopyZelle');
  if (btnCopyZelle) {
    btnCopyZelle.addEventListener('click', async () => {
      const originalText = btnCopyZelle.textContent;
      try {
        await navigator.clipboard.writeText('(201) 300-7370');
        btnCopyZelle.textContent = 'Copied!';
      } catch {
        btnCopyZelle.textContent = 'Copy failed — (201) 300-7370';
      }
      setTimeout(() => {
        btnCopyZelle.textContent = originalText;
      }, 2000);
    });
  }

  goTo(0);
})();
