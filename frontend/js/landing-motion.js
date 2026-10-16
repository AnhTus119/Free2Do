/*
 * Chuyển động cho trang giới thiệu (index.html). Dùng GSAP + ScrollTrigger nạp từ CDN.
 *  - Mở màn hero: ảnh lùi về, tiêu đề trồi lên từng từ, thẻ "thời gian rảnh" vẽ vòng đồng hồ.
 *  - Cuộn: ảnh hero trôi chậm hơn nội dung (parallax), đường thời gian nối 3 bước vẽ dần,
 *    mặt đồng hồ ở dải cuối trang xoay theo cuộn.
 *  - Chuột (chỉ màn hình lớn, con trỏ chính xác): thẻ nổi nghiêng nhẹ theo con trỏ.
 * Không có GSAP hoặc người dùng chọn giảm chuyển động: nội dung hiển thị tĩnh, đầy đủ.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const releaseIntro = () => root.classList.remove('intro-pending');
  const nav = document.querySelector('.navbar');

  if (!window.gsap || !window.ScrollTrigger) {
    releaseIntro();
    // Vẫn giữ bóng đổ cho thanh điều hướng khi cuộn.
    const onScroll = () => nav?.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return;
  }

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  ScrollTrigger.create({
    start: 8,
    end: 'max',
    onToggle: self => nav?.classList.toggle('is-scrolled', self.isActive),
  });

  // Tách tiêu đề thành từng từ, mỗi từ nằm trong một mặt nạ (.w) để trồi lên.
  function splitWords(el) {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((word, i) => {
      const mask = document.createElement('span');
      const inner = document.createElement('span');
      mask.className = 'w';
      inner.className = 'w-i';
      inner.textContent = word;
      mask.append(inner);
      el.append(mask);
      if (i < words.length - 1) el.append(' ');
    });
    return el.querySelectorAll('.w-i');
  }

  const reduce = '(prefers-reduced-motion: reduce)';
  const motionOK = !window.matchMedia(reduce).matches;
  const split = new Map();
  if (motionOK) document.querySelectorAll('[data-split]').forEach(el => split.set(el, splitWords(el)));

  const hero = document.querySelector('.landing-hero');
  const heroImage = hero?.querySelector('.hero-image');
  const heroTitle = hero?.querySelector('h1');
  const card = hero?.querySelector('.hero-card');
  const cardWrap = hero?.querySelector('.hero-card-wrap');
  const arc = hero?.querySelector('.ring-arc');
  const ARC_LENGTH = 175.93;
  const ARC_FILLED = ARC_LENGTH * (1 - 0.62);

  const mm = gsap.matchMedia();

  // ---------- Mở màn hero (~1s cho chữ, ảnh lắng xuống chậm hơn) ----------
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    if (!hero) return;
    const wide = window.matchMedia('(min-width: 1101px)').matches;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo(heroImage, { scale: 1.2 }, { scale: wide ? 1.12 : 1, duration: 1.6, ease: 'power2.out' }, 0)
      .from('.hero-eyebrow', { y: 14, autoAlpha: 0, duration: 0.5 }, 0.12)
      .from(split.get(heroTitle) || heroTitle, { yPercent: 120, duration: 0.85, stagger: 0.06, ease: 'power4.out' }, 0.2)
      .from('.hero-content p', { y: 16, autoAlpha: 0, duration: 0.6 }, 0.5)
      .from('.hero-actions > *', { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, 0.62);
    if (card && wide) {
      tl.from(card, { y: 32, scale: 0.94, autoAlpha: 0, duration: 0.8 }, 0.55)
        .fromTo(arc, { strokeDashoffset: ARC_LENGTH }, { strokeDashoffset: ARC_FILLED, duration: 1.1, ease: 'power2.inOut' }, 0.85)
        .from(card.querySelectorAll('.hc-list li'), { x: -10, autoAlpha: 0, duration: 0.45, stagger: 0.1 }, 1.05);
    }
    // Các trạng thái "from" đã được áp dụng ngay khi tạo timeline nên có thể bỏ lớp ẩn.
    releaseIntro();
  });

  // ---------- Parallax hero: ảnh trôi chậm, thẻ nổi trôi nhanh (chỉ bố cục ảnh nền, >1100px) ----------
  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 1101px)', () => {
    if (!hero) return;
    const scrub = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
    gsap.to(heroImage, { yPercent: 5, ease: 'none', scrollTrigger: scrub });
    gsap.to('.hero-content', { y: -36, ease: 'none', scrollTrigger: { ...scrub } });
    if (cardWrap) gsap.to(cardWrap, { y: -90, ease: 'none', scrollTrigger: { ...scrub } });
  });

  // ---------- Nghiêng thẻ theo con trỏ ----------
  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 1101px) and (hover: hover) and (pointer: fine)', () => {
    if (!hero || !card) return;
    gsap.set(card, { transformPerspective: 900 });
    const rotX = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3' });
    const rotY = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3' });
    const imgX = gsap.quickTo(heroImage, 'x', { duration: 1, ease: 'power3' });
    const move = event => {
      const rect = hero.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      rotY(nx * 10);
      rotX(-ny * 8);
      imgX(nx * -14);
    };
    const leave = () => { rotX(0); rotY(0); imgX(0); };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => {
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
    };
  });

  // ---------- Các phần nội dung khi cuộn tới ----------
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const section = document.querySelector('#cach-hoat-dong');
    if (section) {
      const heading = section.querySelector('.section-heading');
      gsap.timeline({ scrollTrigger: { trigger: section, start: 'top 78%', once: true }, defaults: { ease: 'power3.out' } })
        .from(section.querySelector('.section-kicker'), { y: 12, autoAlpha: 0, duration: 0.45 })
        .from(split.get(heading) || heading, { yPercent: 110, duration: 0.7, stagger: 0.035, ease: 'power4.out' }, 0.08)
        .from(section.querySelector('.section-lead'), { y: 14, autoAlpha: 0, duration: 0.55 }, 0.3);

      const grid = section.querySelector('.feature-grid');
      gsap.from(grid.querySelectorAll('.feature-card'), {
        y: 40, autoAlpha: 0, duration: 0.65, stagger: 0.12, ease: 'power3.out',
        scrollTrigger: { trigger: grid, start: 'top 85%', once: true },
      });
    }

    const band = document.querySelector('.closing-band');
    if (band) {
      gsap.from(band, { y: 36, scale: 0.97, autoAlpha: 0, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: band, start: 'top 88%', once: true } });
      const scrub = { trigger: band, start: 'top bottom', end: 'bottom top', scrub: true };
      gsap.fromTo(band.querySelector('.band-ring'), { rotation: -30 }, { rotation: 60, ease: 'none', scrollTrigger: scrub });
      gsap.fromTo(band.querySelector('.band-glow'), { yPercent: -12 }, { yPercent: 18, ease: 'none', scrollTrigger: { ...scrub } });
    }
  });

  // ---------- Đường thời gian nối 3 bước (bố cục 3 cột) ----------
  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 769px)', () => {
    const grid = document.querySelector('.feature-grid');
    const fill = grid?.querySelector('.feature-rail i');
    if (!fill) return;
    const badges = [...grid.querySelectorAll('.feature-number')];
    const light = progress => badges.forEach((badge, i) => badge.classList.toggle('is-lit', progress >= i / (badges.length - 1) - 0.02));
    gsap.fromTo(fill, { scaleX: 0 }, {
      scaleX: 1, ease: 'none',
      scrollTrigger: {
        trigger: grid, start: 'top 72%', end: 'bottom 60%', scrub: 0.6,
        onUpdate: self => light(self.progress),
        onRefresh: self => light(self.progress),
      },
    });
    return () => badges.forEach(badge => badge.classList.remove('is-lit'));
  });

  // Khi không có chuyển động, các bước hiện sẵn ở trạng thái đã "sáng".
  if (!motionOK) document.querySelectorAll('.feature-number').forEach(badge => badge.classList.add('is-lit'));
})();
