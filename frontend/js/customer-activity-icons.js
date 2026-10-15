(function () {
  'use strict';

  const ICONS = {
    'an-uong': '../img/map-icons/an-uong.jpg',
    billiard: '../img/map-icons/billiard.jpg',
    bowling: '../img/map-icons/bowling.jpg',
    'ca-hat': '../img/map-icons/ca-hat.jpg',
    'ca-phe': '../img/map-icons/ca-phe.jpg',
    game: '../img/map-icons/game.jpg',
    'goi-dau': '../img/map-icons/goi-dau.jpg',
    'lam-dep': '../img/map-icons/lam-dep.jpg',
    'may-anh': '../img/map-icons/may-anh.jpg',
    'mua-sam': '../img/map-icons/mua-sam.jpg',
    'tham-quan': '../img/map-icons/tham-quan.jpg',
    'the-thao': '../img/map-icons/the-thao.jpg',
    workshop: '../img/map-icons/workshop.jpg',
    'xem-phim': '../img/map-icons/xem-phim.jpg',
  };

  // Tên/mô tả hoạt động được ưu tiên trước tags. Nhờ vậy một quán cà phê có
  // thêm tag Workshop vẫn dùng icon cà phê, còn hoạt động workshop thật dùng
  // icon workshop. Nếu backend gửi map_icon_key thì giá trị đó được ưu tiên.
  const RULES = [
    { key: 'billiard', keywords: ['billiard', 'biliard', 'bi-a', 'bi a'] },
    { key: 'bowling', keywords: ['bowling'] },
    { key: 'ca-hat', keywords: ['ca hát', 'karaoke', 'music box', 'muzic box', 'hộp nhạc'] },
    { key: 'xem-phim', keywords: ['xem phim', 'rạp phim', 'cinema'] },
    { key: 'game', keywords: ['game', 'gaming', 'esports', 'cyber', 'quán net', 'boardgame'] },
    { key: 'goi-dau', keywords: ['gội đầu', 'dưỡng sinh'] },
    { key: 'lam-dep', keywords: ['làm đẹp', 'nail', 'skincare', 'chăm sóc da'] },
    { key: 'may-anh', keywords: ['chụp ảnh', 'máy ảnh', 'camera', 'photobooth', 'photo easel'] },
    { key: 'mua-sam', keywords: ['mua sắm', 'thanh lý', 'ký gửi'] },
    { key: 'tham-quan', keywords: ['tham quan', 'bảo tàng'] },
    { key: 'the-thao', keywords: ['thể thao', 'fitness', 'gym'] },
    { key: 'ca-phe', keywords: ['cà phê', 'cafe', 'coffee', 'onemore workspace', 'studyspace'] },
    { key: 'workshop', keywords: ['workshop'] },
    { key: 'an-uong', keywords: ['ăn uống', 'quán ăn', 'ẩm thực', 'nhà hàng', 'tiệm mì'] },
  ];

  function normalize(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
  }

  function slugify(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function findRule(text) {
    const normalized = normalize(text);
    return RULES.find(rule => rule.keywords.some(keyword => normalized.includes(normalize(keyword))));
  }

  function urlFor(activity, categoryNames) {
    const explicitKey = normalize(activity.map_icon_key).replace(/\s+/g, '-');
    if (ICONS[explicitKey]) return ICONS[explicitKey];

    const primaryText = [activity.name, activity.business_name, activity.description].filter(Boolean).join(' ');
    const primaryRule = findRule(primaryText);
    if (primaryRule) return ICONS[primaryRule.key];

    const categoryRule = findRule([...(categoryNames || []), ...(activity.category_ids || [])].join(' '));
    if (categoryRule) return ICONS[categoryRule.key];

    // Quy ước tự động cho tag mới: tag "Yoga" dùng file yoga.jpg. Nếu file
    // chưa tồn tại, customer-map.js tự quay về marker mặc định.
    const firstCategory = (categoryNames || []).find(Boolean);
    const automaticKey = slugify(firstCategory);
    return automaticKey ? `../img/map-icons/${automaticKey}.jpg` : null;
  }

  window.Free2DoActivityIcons = { ICONS, RULES, normalize, slugify, urlFor };
})();
