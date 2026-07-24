(() => {
  const slidesEl = document.getElementById('slides');
  const track = document.getElementById('slideTrack');
  const slides = Array.from(track.querySelectorAll('.slide'));
  const progress = document.getElementById('progress');
  const privacyNote = document.querySelector('.privacy-note');
  const btnBack = document.getElementById('btnBack');
  const btnNext = document.getElementById('btnNext');
  const summaryEl = document.getElementById('summary');

  const FIELD_LABELS = {
    fullName: 'Name',
    email: 'Email',
    phone: 'Phone',
    usage: 'Primary use',
    heaviestItem: 'Heaviest item',
    specificFit: 'Needs to fit',
    bagSize: 'Preferred size',
    tattoo: 'Tattoo embroidery',
    tattooPicks: 'Tattoo selections',
    instaMatch: 'Match an Insta bag',
    instaBag: 'Matched bag',
    favoriteColors: 'Favorite colors',
    dislikedColors: 'Colors to avoid',
    allergies: 'Fabric allergies',
  };

  const VALUE_LABELS = {
    usage: {
      groceries: 'Groceries',
      clothes: 'Carry clothes',
      laptop: 'Laptop bag',
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
      'small-1': 'Small 1',
      'small-2': 'Small 2',
      'small-3': 'Small 3',
      'small-4': 'Small 4',
      'medium-1': 'Medium 1',
      'medium-2': 'Medium 2',
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

  function validateSlide(slide) {
    const fields = requiredFieldsFor(slide);
    let valid = true;
    fields.forEach((field) => {
      const wrapper = field.closest('.field') || field.parentElement;
      const ok = field.checkValidity();
      if (wrapper) wrapper.classList.toggle('field--invalid', !ok);
      if (!ok) valid = false;
    });
    if (!valid) {
      const firstInvalid = fields.find((f) => !f.checkValidity());
      if (firstInvalid) firstInvalid.focus();
    }
    return valid;
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

    if (current === 0) {
      btnNext.textContent = 'Start Survey';
    } else if (current === reviewIndex) {
      btnNext.textContent = 'Submit request';
    } else if (current === lastIndex) {
      btnNext.textContent = 'Start a new request';
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
    if (current === reviewIndex) renderSummary();
    syncSlidesHeight();
  }

  btnNext.addEventListener('click', () => {
    if (current === lastIndex) {
      // restart
      document.querySelectorAll('input, textarea').forEach((el) => {
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
      goTo(0);
      return;
    }
    if (current === reviewIndex) {
      // "submission" — no backend wired up, just advance to thank-you slide.
      goTo(current + 1);
      return;
    }
    goTo(current + 1);
  });

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
      goTo(current + 1);
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

  window.addEventListener('resize', syncSlidesHeight);

  // Tattoo picks: up to 3 total, max 2 small + 1 medium
  const tattooChecks = Array.from(document.querySelectorAll('input[name="tattooPicks"]'));
  function updateTattooCaps() {
    const checked = tattooChecks.filter((c) => c.checked);
    const smallCount = checked.filter((c) => c.dataset.size === 'small').length;
    const mediumCount = checked.filter((c) => c.dataset.size === 'medium').length;
    tattooChecks.forEach((c) => {
      if (c.checked) {
        c.disabled = false;
        return;
      }
      c.disabled = (c.dataset.size === 'small' && smallCount >= 2)
        || (c.dataset.size === 'medium' && mediumCount >= 1);
    });
  }
  tattooChecks.forEach((c) => c.addEventListener('change', updateTattooCaps));

  // Lightbox for "click to expand" swatches
  const lightbox = document.getElementById('lightbox');
  const lightboxImage = document.getElementById('lightboxImage');
  function openLightbox(label, src) {
    if (src) {
      lightboxImage.innerHTML = '';
      const img = document.createElement('img');
      img.src = src;
      img.alt = label;
      lightboxImage.appendChild(img);
    } else {
      lightboxImage.textContent = label;
    }
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

  goTo(0);
})();
