(function () {
  'use strict';

  // Thứ tự từ trên xuống: quy tắc khớp đầu tiên sẽ được sử dụng.
  // Có thể thêm từ khóa tiếng Việt/không dấu hoặc ID danh mục vào đây.
  const RULES = [
    { icon: '../img/map-icons/bowling.jpg', keywords: ['bowling'] },
    { icon: '../img/map-icons/brunch.jpg', keywords: ['brunch'] },
    { icon: '../img/map-icons/music-box.jpg', keywords: ['music box', 'hộp nhạc', 'hop nhac'] },
    { icon: '../img/map-icons/wellness-hair.jpg', keywords: ['gội đầu dưỡng sinh', 'goi dau duong sinh', 'dưỡng sinh'] },
    { icon: '../img/map-icons/skincare.jpg', keywords: ['skincare', 'chăm sóc da', 'cham soc da'] },
    { icon: '../img/map-icons/gaming.jpg', keywords: ['tay cầm', 'tay cam', 'gaming', 'chơi game', 'choi game', 'playstation', 'xbox'] },
    { icon: '../img/map-icons/workshop.jpg', keywords: ['workshop'] },
    { icon: '../img/map-icons/restaurant.jpg', keywords: ['quán ăn', 'quan an', 'ăn uống', 'an uong', 'ẩm thực', 'am thuc', 'nhà hàng', 'nha hang'] },
  ];

  function normalize(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
  }

  function searchableText(activity, categoryNames) {
    return normalize([
      activity.name,
      activity.business_name,
      activity.description,
      activity.address,
      ...(activity.category_ids || []),
      ...(categoryNames || []),
    ].filter(Boolean).join(' '));
  }

  function urlFor(activity, categoryNames) {
    const text = searchableText(activity, categoryNames);
    return RULES.find(rule => rule.keywords.some(keyword => text.includes(normalize(keyword))))?.icon || null;
  }

  window.Free2DoActivityIcons = { RULES, normalize, urlFor };
})();
