(function () {
  'use strict';
  // Ảnh doanh nghiệp lấy từ database (API), không còn gắn cứng trong frontend.
  //  - Danh sách: business_logo_url (kết quả tìm kiếm) hoặc business_avatar_url (danh sách hoạt động).
  //  - Trang chi tiết: activity.business_media (ảnh gallery của doanh nghiệp).
  const logo = item => item.business_logo_url || item.business_avatar_url || null;
  const gallery = activity => (activity.business_media || [])
    .filter(media => media.media_url)
    .map(media => ({ media_url: media.media_url, media_type: media.media_type || 'image', media_kind: 'gallery' }));
  // Ảnh đại diện của thẻ hoạt động: logo doanh nghiệp -> ảnh bìa của hoạt động -> icon giống bản đồ.
  const thumb = item => logo(item)
    || item.image_url
    || item.media?.find(media => media.media_type === 'image')?.media_url
    || window.Free2DoActivityIcons?.urlFor(item, item.category_names)
    || null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Thẻ <img> vuông (CSS cắt giữa ảnh); onerror quay về chữ dự phòng nếu file ảnh lỗi.
  const thumbHTML = (item, fallback = '<span>Chưa có ảnh</span>') => {
    const url = thumb(item);
    return url ? `<img src="${escape(url)}" alt="${escape(item.business_name || item.name || '')}" loading="lazy" onerror="this.outerHTML='${fallback.replace(/'/g, '&#39;')}'">` : fallback;
  };
  window.Free2DoBusinessMedia = { logo, gallery, thumb, thumbHTML };
})();
