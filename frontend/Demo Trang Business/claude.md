# Project: Demo Trang Business

This directory contains HTML and CSS files for the "FREE2DO Business" web application interface.

## File: `app-style.css`
```css
/* ===== FREE2DO CUSTOMER APP — SHARED STYLES ===== */
:root{
  --sage:#B2BD8B; --pink:#FF9DA3; --rose:#DB6680; --rose-dark:#BE4F68;
  --cream:#FFEBC6; --brown:#6E5248; --ink:#2B2420; --muted:#8A7B6E;
  --paper:#FBF7F0; --line:#EADFCB;
  --success:#5C7A42; --success-bg:#E9F0DF;
  --warn:#B8792E; --warn-bg:#FBEEDD;
  --danger:#C1483E; --danger-bg:#FBEAE7;
}
*{box-sizing:border-box;}
body{margin:0;font-family:'Inter',sans-serif;color:var(--ink);background:var(--paper);overflow-y:scroll;}
a{color:inherit;}
img,svg{max-width:100%;}

/* ===== NAVBAR ===== */
.navbar{
  position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid var(--line);
  display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:14px 40px;
}
.nav-logo{display:flex;align-items:center;gap:12px;font-weight:800;font-size:18px;text-decoration:none;color:inherit;}
.nav-center{display:flex;gap:32px;}
.nav-link{font-size:14px;font-weight:600;color:var(--muted);text-decoration:none;padding:6px 2px;border-bottom:2px solid transparent;}
.nav-link.active{color:var(--ink);border-color:var(--rose);}
.nav-right{display:flex;align-items:center;gap:20px;justify-self:end;}
.nav-icon{display:inline-flex;align-items:center;color:var(--brown);cursor:pointer;position:relative;}
.nav-icon .dot-badge{position:absolute;top:-3px;right:-5px;width:7px;height:7px;border-radius:50%;background:var(--rose);border:2px solid #fff;}
.nav-who{display:flex;align-items:center;gap:9px;cursor:pointer;}
.nav-avatar{width:32px;height:32px;border-radius:50%;background:var(--cream);color:var(--brown);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;}
.nav-name{font-size:13.5px;font-weight:600;}
.dropdown-wrap { position: relative; user-select: none; }
.dropdown-menu { display: none; position: absolute; top: calc(100% + 10px); right: 0; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 8px; min-width: 180px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); z-index: 100; }
.dropdown-menu.show { display: block; }
.dropdown-menu a { display: block; padding: 10px 14px; color: var(--ink); text-decoration: none; font-size: 13.5px; font-weight: 600; border-radius: 8px; }
.dropdown-menu a:hover { background: var(--paper); color: var(--rose-dark); }

@media (max-width:860px){ .nav-center{display:none;} .navbar{padding:14px 20px;} }

/* ===== ICONS ===== */
.icon{width:18px;height:18px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;vertical-align:-4px;flex-shrink:0;}
.icon-sm{width:14px;height:14px;vertical-align:-2px;}
.icon-lg{width:22px;height:22px;}
.icon-xl{width:32px;height:32px;}
.icon-fill{fill:currentColor;stroke:none;}
.icon-rose{color:var(--rose-dark);}
.icon-success{color:var(--success);}
.icon-warn{color:var(--warn);}
.icon-danger{color:var(--danger);}
.icon-brown{color:var(--brown);}
.icon-muted{color:var(--muted);}
.icon-ink{color:var(--ink);}
.icon-white{color:#fff;}
.btn .icon{vertical-align:-3px;}
.star-row{display:inline-flex;align-items:center;gap:1px;}

/* ===== BUTTONS ===== */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 22px;border-radius:100px;font-size:14px;font-weight:700;cursor:pointer;border:none;text-decoration:none;}
.btn-primary{background:var(--rose);color:#fff;}
.btn-primary:hover{background:var(--rose-dark);}
.btn-secondary{background:#fff;color:var(--ink);border:1.5px solid var(--line);}
.btn-secondary:hover{border-color:var(--brown);}
.btn-ghost{background:transparent;color:var(--rose-dark);}
.btn-block{width:100%;}

/* ===== SECTION SHELL ===== */
.wrap{max-width:1180px;margin:0 auto;padding:0 40px;}
.section{padding:48px 0;}
.section-title{font-size:22px;font-weight:800;margin:0 0 6px;}
.section-sub{font-size:14px;color:var(--muted);margin:0 0 24px;}

/* ===== HERO / MATCH CARD ===== */
.hero{background:linear-gradient(180deg,#FFF6E6 0%,var(--paper) 100%);padding:56px 0 40px;text-align:center;}
.hero h1{font-size:38px;font-weight:800;margin:0 0 10px;}
.hero p{font-size:15px;color:var(--muted);margin:0 0 32px;}
.match-card{
  background:#fff;border:1px solid var(--line);border-radius:24px;padding:28px;
  max-width:960px;margin:0 auto;text-align:left;box-shadow:0 24px 50px -30px rgba(43,36,32,0.25);
}
.match-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:20px;}
.mode-toggle{display:flex;gap:8px;background:var(--paper);padding:5px;border-radius:100px;width:fit-content;margin:0 auto 22px;}
.mode-btn{padding:9px 18px;border-radius:100px;font-size:13px;font-weight:700;text-decoration:none;color:var(--muted);}
.mode-btn.active{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,0.08);}
.mode-btn:not(.active):hover{color:var(--rose-dark);}
.match-field label{display:block;font-size:12.5px;font-weight:700;color:var(--brown);margin-bottom:8px;}
.chip-row{display:flex;gap:8px;flex-wrap:wrap;}
.chip{padding:8px 14px;border-radius:100px;border:1.5px solid var(--line);font-size:12.5px;font-weight:600;cursor:pointer;background:#fff;color:var(--ink);}
.chip.active{background:var(--ink);color:#fff;border-color:var(--ink);}
.slider{width:100%;accent-color:var(--rose);}
.loc-btn{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--rose-dark);cursor:pointer;margin-top:8px;}
.match-actions{display:flex;gap:12px;justify-content:center;margin-top:8px;}

/* ===== CATEGORY CARDS ===== */
.cat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
.cat-card{
  background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;text-align:center;
  cursor:pointer;text-decoration:none;color:var(--ink);
}
.cat-card:hover{border-color:var(--rose);}
.cat-card .emoji{font-size:26px;margin-bottom:8px;}
.cat-card .label{font-size:13px;font-weight:700;}

/* ===== ACTIVITY CARD ===== */
.activity-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.activity-card{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;text-decoration:none;color:var(--ink);display:block;}
.activity-card:hover{border-color:var(--rose);}
.activity-img{height:140px;display:flex;align-items:center;justify-content:center;font-size:40px;position:relative;}
.match-badge{position:absolute;top:10px;right:10px;background:#fff;color:var(--rose-dark);font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:100px;}
.activity-body{padding:16px;}
.activity-title{font-size:14.5px;font-weight:700;margin-bottom:3px;}
.activity-biz{font-size:12px;color:var(--muted);margin-bottom:8px;}
.activity-meta{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted);flex-wrap:wrap;}
.activity-price{font-weight:800;color:var(--ink);}
.tag-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}
.tag{font-size:11px;font-weight:600;background:var(--cream);color:var(--brown);padding:3px 9px;border-radius:100px;}
.why-match{background:var(--success-bg);border-radius:10px;padding:8px 10px;font-size:11.5px;color:var(--success);margin-top:10px;line-height:1.6;}

/* ===== MAP PLACEHOLDER ===== */
.map-box{
  background:#EFE9DA;border:1px solid var(--line);border-radius:20px;height:340px;position:relative;overflow:hidden;
}
.map-grid-bg{position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:36px 36px;opacity:0.5;}
.map-pin{position:absolute;transform:translate(-50%,-100%);background:var(--rose);color:#fff;font-size:11px;font-weight:700;padding:5px 9px;border-radius:100px 100px 100px 0;box-shadow:0 6px 14px rgba(219,102,128,0.4);}
.map-pin.me{background:var(--ink);}
.map-cta{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);}

/* ===== SEARCH PAGE LAYOUT ===== */
.search-layout{display:grid;grid-template-columns:260px 1fr;gap:28px;}
.filter-box{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;height:fit-content;position:sticky;top:80px;}
.filter-group{margin-bottom:22px;}
.filter-group:last-child{margin-bottom:0;}
.filter-group h4{font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.03em;color:var(--brown);margin:0 0 12px;}
.radio-row{display:flex;flex-direction:column;gap:8px;font-size:13px;}
.radio-row label{display:flex;align-items:center;gap:8px;cursor:pointer;}

.result-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;}
.result-count{font-size:13.5px;color:var(--muted);}
.view-toggle{display:flex;gap:6px;background:var(--paper);padding:4px;border-radius:100px;}
.view-toggle button{border:none;background:transparent;padding:7px 14px;border-radius:100px;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--muted);}
.view-toggle button.active{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,0.08);}
.sort-select{height:38px;border-radius:10px;border:1.5px solid var(--line);padding:0 12px;font-family:'Inter',sans-serif;font-size:13px;background:#fff;}

.split-mode{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.result-list{display:flex;flex-direction:column;gap:14px;}
.result-row{display:flex;gap:14px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px;cursor:pointer;}
.result-row:hover{border-color:var(--rose);}
.result-thumb{width:64px;height:64px;border-radius:10px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:24px;}
.no-time{color:var(--danger);font-weight:600;font-size:11.5px;margin-top:4px;}

/* ===== MATCH BREAKDOWN ===== */
.breakdown-row{display:flex;align-items:center;gap:12px;margin-bottom:12px;}
.breakdown-label{width:130px;font-size:13px;color:var(--muted);flex:0 0 auto;}
.breakdown-bar{flex:1;height:8px;background:var(--line);border-radius:100px;overflow:hidden;}
.breakdown-fill{height:100%;background:var(--rose);border-radius:100px;}
.breakdown-pct{width:40px;text-align:right;font-size:13px;font-weight:700;}

/* ===== REVIEW CARD ===== */
.review-card{border-bottom:1px solid var(--line);padding:18px 0;}
.review-card:last-child{border-bottom:none;}
.review-top{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.review-name{font-weight:700;font-size:13.5px;}
.review-stars{color:var(--rose);font-size:13px;}
.review-date{font-size:12px;color:var(--muted);margin-left:auto;}
.review-text{font-size:13.5px;line-height:1.6;color:var(--ink);}

/* ===== TABS (account page) ===== */
.tabs{display:flex;gap:6px;background:#fff;border:1px solid var(--line);border-radius:100px;padding:5px;width:fit-content;margin-bottom:28px;}
.tab-btn{border:none;background:transparent;padding:9px 20px;border-radius:100px;font-size:13.5px;font-weight:700;cursor:pointer;color:var(--muted);}
.tab-btn.active{background:var(--ink);color:#fff;}
.tab-pane{display:none;}
.tab-pane.active{display:block;}

/* ===== FORM ===== */
.field{margin-bottom:18px;}
.field label{display:block;font-size:13px;font-weight:700;margin-bottom:8px;}
.field input,.field textarea{
  width:100%;border:1.5px solid var(--line);border-radius:12px;padding:12px 14px;
  font-family:'Inter',sans-serif;font-size:14px;color:var(--ink);background:#fff;
}
.field textarea{resize:vertical;min-height:90px;}
.field input:focus,.field textarea:focus{outline:none;border-color:var(--rose);}

/* ===== EMPTY STATE ===== */
.empty-state{text-align:center;padding:60px 20px;color:var(--muted);}
.empty-state .emoji{font-size:40px;margin-bottom:12px;}
.empty-state p{margin:0 0 16px;font-size:14px;}

/* ===== HISTORY ITEM ===== */
.history-row{display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:12px;}
.history-tags{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:6px;}

@media (max-width:1000px){
  .match-grid{grid-template-columns:repeat(2,1fr);}
  .cat-grid{grid-template-columns:repeat(2,1fr);}
  .activity-grid{grid-template-columns:1fr 1fr;}
  .search-layout{grid-template-columns:1fr;}
  .split-mode{grid-template-columns:1fr;}
}

/* ===== BUSINESS: STAT CARDS ===== */
.biz-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;}
.biz-stat-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;}
.biz-stat-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
.biz-stat-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;}
.biz-stat-num{font-size:24px;font-weight:800;line-height:1;}
.biz-stat-label{font-size:12.5px;color:var(--muted);margin-top:6px;}

/* ===== BUSINESS: TABLE ===== */
.biz-table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;}
.biz-table thead th{text-align:left;font-size:12px;color:var(--muted);font-weight:700;padding:12px 18px;border-bottom:1px solid var(--line);background:#FCFAF6;}
.biz-table tbody td{padding:14px 18px;font-size:13.5px;border-bottom:1px solid var(--line);vertical-align:middle;}
.biz-table tbody tr:last-child td{border-bottom:none;}
.biz-table tbody tr:hover{background:#FCFAF6;}

/* ===== BUSINESS: BADGE ===== */
.b-badge{display:inline-block;padding:3px 10px;border-radius:100px;font-size:11.5px;font-weight:700;white-space:nowrap;}
.b-badge.active{background:var(--success-bg);color:var(--success);}
.b-badge.pending{background:var(--warn-bg);color:var(--warn);}
.b-badge.hidden{background:#EFE9DF;color:var(--muted);}
.b-badge.expired{background:#EFE9DF;color:var(--muted);}

/* ===== BUSINESS: PRICING CARD ===== */
.plan-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
.plan-card{background:#fff;border:1.5px solid var(--line);border-radius:20px;padding:28px 24px;text-align:center;position:relative;display:flex;flex-direction:column;}
.plan-card.highlight{border-color:var(--rose);box-shadow:0 20px 40px -25px rgba(219,102,128,0.5);}
.plan-badge-current{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:11px;font-weight:700;padding:5px 14px;border-radius:100px;}
.plan-name{font-size:13px;font-weight:800;letter-spacing:0.04em;color:var(--muted);text-transform:uppercase;margin-bottom:10px;}
.plan-price{font-size:30px;font-weight:800;margin-bottom:4px;}
.plan-price span{font-size:13px;font-weight:500;color:var(--muted);}
.plan-features{text-align:left;margin:20px 0;padding:0;list-style:none;font-size:13px;color:var(--ink);flex:1;}
.plan-features li{padding:8px 0;border-bottom:1px solid var(--line);}
.plan-features li:last-child{border-bottom:none;}

/* ===== ROW ACTIONS ===== */
.row-actions{display:flex;gap:8px;}
.row-btn{border:1.5px solid var(--line);background:#fff;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;color:var(--ink);text-decoration:none;display:inline-flex;align-items:center;gap:5px;}
.row-btn .icon{vertical-align:-2px;}
.row-btn.danger{color:var(--danger);border-color:#F0C9C4;}
.row-btn.approve{color:var(--success);border-color:#CFE0BE;}

/* ===== SLIDE-OVER FORM PANEL ===== */
.panel-overlay{display:none;position:fixed;inset:0;background:rgba(43,36,32,0.35);z-index:90;}
.panel-overlay.show{display:block;}
.slide-panel{
  position:fixed;top:0;right:0;height:100vh;width:460px;max-width:92vw;background:#fff;z-index:91;
  transform:translateX(100%);transition:transform .25s ease;overflow-y:auto;padding:28px;box-shadow:-20px 0 50px rgba(0,0,0,0.15);
}
.slide-panel.show{transform:translateX(0);}
.panel-close{float:right;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);}

/* ===== RESPONSIVE WRAPPERS ===== */
.table-responsive { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 15px; }

/* ===== MOBILE NAVIGATION ===== */
.mobile-menu-btn { display: none; background: none; border: none; cursor: pointer; color: var(--ink); padding: 5px; }
.mobile-nav-panel {
  display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100vh;
  background: rgba(43,36,32,0.4); z-index: 200; opacity: 0; transition: opacity 0.3s;
}
.mobile-nav-panel.show { display: block; opacity: 1; }
.mobile-nav-content {
  position: absolute; top: 0; left: -300px; width: 280px; height: 100%; background: #fff;
  padding: 24px; box-shadow: 5px 0 15px rgba(0,0,0,0.1); transition: left 0.3s;
  display: flex; flex-direction: column; gap: 16px;
}
.mobile-nav-panel.show .mobile-nav-content { left: 0; }
.mobile-nav-close { align-self: flex-end; background: none; border: none; font-size: 28px; line-height: 1; color: var(--muted); cursor: pointer; }
.mobile-nav-link { font-size: 15px; font-weight: 600; color: var(--muted); text-decoration: none; padding: 12px 0; border-bottom: 1px solid var(--line); }
.mobile-nav-link.active { color: var(--rose-dark); }

@media (max-width: 1024px) {
  .biz-stats { grid-template-columns: repeat(2, 1fr); }
  .plan-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 860px) {
  .nav-center { display: none; }
  .mobile-menu-btn { display: block; }
  .nav-right { gap: 12px; }
  .nav-name { display: none; }
  .navbar { display: flex; justify-content: space-between; padding: 14px 20px; }
}

@media (max-width: 768px) {
  .wrap { padding: 0 20px; }
  .plan-grid { grid-template-columns: 1fr; }
  .activity-grid { grid-template-columns: 1fr; }
  .cat-grid { grid-template-columns: 1fr 1fr; }
  .match-grid { grid-template-columns: 1fr; }
  .slide-panel { width: 100%; max-width: 100vw; padding: 20px; }
}

@media (max-width: 600px) {
  .biz-stats { grid-template-columns: 1fr; }
  .navbar { padding: 14px 20px; }
  .nav-logo { font-size: 16px; width: auto; }
}
```

## File: `business-home.html`
```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>FREE2DO Business — Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app-style.css">
</head>
<body>

<div class="navbar">
  <div class="nav-left" style="display:flex;align-items:center;gap:12px;">
    <button class="mobile-menu-btn" onclick="toggleMobileMenu()"><svg class="icon icon-lg" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
    <a href="business-home.html" class="nav-logo"><img src="Logo.svg" alt="Logo" style="width:38px;">FREE2DO <span style="color:var(--muted);font-weight:600;">Business</span></a>
  </div>
  <div class="nav-center">
    <a href="business-home.html" class="nav-link active">Tổng quan</a>
    <a href="my-activities.html" class="nav-link">Hoạt động của tôi</a>
    <a href="reviews.html" class="nav-link">Đánh giá</a>
  </div>
  <div class="nav-right">
    <div class="nav-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="dot-badge"></span></div>
    <div class="nav-who dropdown-wrap" onclick="toggleMenu(event)">
      <div class="nav-avatar">S</div><div class="nav-name">She.slays</div><svg class="icon icon-sm icon-muted" viewBox="0 0 24 24" style="margin-left:-4px;"><polyline points="6 9 12 15 18 9"/></svg>
      <div class="dropdown-menu" id="nav-user-menu">
        <a href="business-profile.html">Hồ sơ Doanh nghiệp</a>
        <a href="upgrade-plan.html">Gói dịch vụ</a>
        <a href="#">Đăng xuất</a>
      </div>
    </div>
  </div>
</div>

<div class="wrap" style="padding-top:32px;padding-bottom:60px;">

  <div class="welcome" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;">
    <div>
      <h2 style="font-size:22px;font-weight:800;margin:0 0 6px;display:flex;align-items:center;gap:8px;">Xin chào, She.slays <svg class="icon icon-lg icon-fill icon-rose" viewBox="0 0 24 24"><path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z"/><path d="M19 13l.6 2.4L22 16l-2.4.6L19 19l-.6-2.4L16 16l2.4-.6z"/></svg></h2>
      <p style="color:var(--muted);font-size:14px;margin:0;">Đây là tổng quan hoạt động kinh doanh của bạn trên FREE2DO.</p>
    </div>
  </div>

  <div class="biz-stats">
    <div class="biz-stat-card">
      <div class="biz-stat-top"><div class="biz-stat-icon icon-warn" style="background:var(--warn-bg);"><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div></div>
      <div class="biz-stat-num">4</div><div class="biz-stat-label">Tổng hoạt động</div>
    </div>
    <div class="biz-stat-card">
      <div class="biz-stat-top"><div class="biz-stat-icon icon-success" style="background:var(--success-bg);"><svg class="icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div></div>
      <div class="biz-stat-num">3</div><div class="biz-stat-label">Hoạt động đang hiển thị</div>
    </div>
    <div class="biz-stat-card">
      <div class="biz-stat-top"><div class="biz-stat-icon icon-brown" style="background:#EFF1E7;"><svg class="icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></div></div>
      <div class="biz-stat-num">1.284</div><div class="biz-stat-label">Tổng lượt xem</div>
    </div>
    <div class="biz-stat-card">
      <div class="biz-stat-top"><div class="biz-stat-icon icon-rose" style="background:#FDEDEF;"><svg class="icon icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div></div>
      <div class="biz-stat-num">4.8</div><div class="biz-stat-label">Đánh giá trung bình</div>
    </div>
  </div>

    <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px;margin-top:24px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div class="section-title" id="chart-title" style="font-size:15.5px;margin:0;">Thống kê tương tác</div>
      <select id="chartPeriodSelect" onchange="updateChartData()" style="border:1px solid var(--line);border-radius:8px;padding:6px 32px 6px 12px;font-size:13px;color:var(--ink);outline:none;background:#fff url('data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' width=\'16\' height=\'16\' fill=\'none\' stroke=\'%2350555C\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'6 9 12 15 18 9\'/></svg>') no-repeat right 10px center;appearance:none;-webkit-appearance:none;cursor:pointer;">
        <option value="7">7 ngày qua</option>
        <option value="30">30 ngày qua</option>
      </select>
    </div>
    <div style="height:300px;width:100%;">
      <canvas id="engagementChart"></canvas>
    </div>
  </div>

  <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px;margin-top:24px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div class="section-title" style="font-size:15.5px;margin:0;">Tổng quan Đánh giá</div>
      <a href="reviews.html" style="font-size:13.5px;font-weight:600;color:var(--rose);text-decoration:none;display:flex;align-items:center;gap:4px;">Chi tiết Đánh giá <svg class="icon icon-sm icon-rose" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></a>
    </div>
    <div style="height:300px;width:100%;">
      <canvas id="ratingChart"></canvas>
    </div>
  </div>

</div>


<div class="mobile-nav-panel" id="mobile-nav">
  <div class="mobile-nav-content">
    <button class="mobile-nav-close" onclick="toggleMobileMenu()">&times;</button>
    <a href="business-home.html" class="mobile-nav-link active">Tổng quan</a>
    <a href="my-activities.html" class="mobile-nav-link">Hoạt động của tôi</a>
    <a href="reviews.html" class="mobile-nav-link">Đánh giá</a>
  </div>
</div>
<script>
function toggleMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('nav-user-menu');
  if(menu) menu.classList.toggle('show');
}
function toggleMobileMenu() {
  const panel = document.getElementById('mobile-nav');
  if(panel) panel.classList.toggle('show');
}
window.addEventListener('click', function(e) {
  const menu = document.getElementById('nav-user-menu');
  if(menu && menu.classList.contains('show') && !e.target.closest('.nav-who')) {
    menu.classList.remove('show');
  }
});
</script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
let engagementChart;
const data7 = {
  labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
  data: [120, 190, 150, 220, 180, 310, 450]
};

const labels30 = Array.from({length: 30}, (_, i) => `${i+1}/9`);
const data30Arr = [
  110, 130, 125, 140, 155, 180, 210, 205, 190, 175, 160, 185, 220, 250, 
  270, 260, 240, 230, 210, 215, 230, 260, 290, 310, 320, 305, 290, 340, 380, 450
];
const data30 = {
  labels: labels30,
  data: data30Arr
};

function updateChartData() {
  const period = document.getElementById('chartPeriodSelect').value;
  const is30 = period === '30';
  const newData = is30 ? data30 : data7;
  
  if (engagementChart) {
    engagementChart.data.labels = newData.labels;
    engagementChart.data.datasets[0].data = newData.data;
    engagementChart.update();
  }
}

document.addEventListener("DOMContentLoaded", function() {
  const ctx = document.getElementById('engagementChart').getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(219, 102, 128, 0.2)');
  gradient.addColorStop(1, 'rgba(219, 102, 128, 0)');

  engagementChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data7.labels,
      datasets: [{
        label: 'Lượt tương tác',
        data: data7.data,
        borderColor: '#DB6680',
        backgroundColor: gradient,
        borderWidth: 2,
        pointBackgroundColor: '#DB6680',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#202124',
          padding: 12,
          titleFont: { family: 'Inter', size: 13 },
          bodyFont: { family: 'Inter', size: 13 },
          displayColors: false,
          callbacks: {
            label: function(context) { return context.parsed.y + ' lượt'; }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 12 }, color: '#8D96A0' }
        },
        y: {
          border: { display: false },
          grid: { color: '#EAECEF', drawBorder: false },
          ticks: { font: { family: 'Inter', size: 12 }, color: '#8D96A0', stepSize: 100 }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index',
      },
    }
  });

  const ratingCtx = document.getElementById('ratingChart').getContext('2d');
  new Chart(ratingCtx, {
    type: 'bar',
    data: {
      labels: ['5 sao', '4 sao', '3 sao', '2 sao', '1 sao'],
      datasets: [{
        label: 'Số lượng đánh giá',
        data: [25, 4, 2, 0, 1],
        backgroundColor: '#DB6680',
        borderRadius: 4,
        barThickness: 20
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#202124',
          padding: 12,
          titleFont: { family: 'Inter', size: 13 },
          bodyFont: { family: 'Inter', size: 13 },
          displayColors: false,
          callbacks: {
            label: function(context) { return context.parsed.x + ' đánh giá'; }
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#EAECEF', drawBorder: false },
          ticks: { font: { family: 'Inter', size: 12 }, color: '#8D96A0', stepSize: 5 }
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { family: 'Inter', size: 13, weight: '600' }, color: '#50555C' }
        }
      }
    }
  });
});
</script>
</body>
</html>
```

## File: `business-profile.html`
```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>FREE2DO Business — Business Profile</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app-style.css">
</head>
<body>

<div class="navbar">
  <div class="nav-left" style="display:flex;align-items:center;gap:12px;">
    <button class="mobile-menu-btn" onclick="toggleMobileMenu()"><svg class="icon icon-lg" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
    <a href="business-home.html" class="nav-logo"><img src="Logo.svg" alt="Logo" style="width:38px;">FREE2DO <span style="color:var(--muted);font-weight:600;">Business</span></a>
  </div>
  <div class="nav-center">
    <a href="business-home.html" class="nav-link">Tổng quan</a>
    <a href="my-activities.html" class="nav-link">Hoạt động của tôi</a>
    <a href="reviews.html" class="nav-link">Đánh giá</a>
  </div>
  <div class="nav-right">
    <div class="nav-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="dot-badge"></span></div>
    <div class="nav-who dropdown-wrap" onclick="toggleMenu(event)">
      <div class="nav-avatar">S</div><div class="nav-name">She.slays</div><svg class="icon icon-sm icon-muted" viewBox="0 0 24 24" style="margin-left:-4px;"><polyline points="6 9 12 15 18 9"/></svg>
      <div class="dropdown-menu" id="nav-user-menu">
        <a href="business-profile.html">Hồ sơ Doanh nghiệp</a>
        <a href="upgrade-plan.html">Gói dịch vụ</a>
        <a href="#">Đăng xuất</a>
      </div>
    </div>
  </div>
</div>

<div class="wrap" style="padding-top:32px;padding-bottom:60px;max-width:760px;">

  <div style="display:flex;align-items:center;gap:18px;margin-bottom:28px;">
    <div class="nav-avatar" style="width:64px;height:64px;font-size:22px;">S</div>
    <div style="flex:1;">
      <div style="font-size:19px;font-weight:800;">She.slays</div>
      <div style="color:var(--muted);font-size:13px;"><svg class="icon icon-sm icon-fill icon-rose" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 4.8 (32 đánh giá) · Xưởng Cafe, Bạch Mai, Hà Nội</div>
    </div>
    <button class="btn btn-secondary" onclick="toggleEdit()"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Chỉnh sửa hồ sơ</button>
  </div>

  <!-- ===== VIEW MODE ===== -->
  <div id="view-mode">
    <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:20px;">
      <div class="section-title" style="font-size:15px;">Giới thiệu</div>
      <p style="font-size:13.5px;line-height:1.7;color:var(--ink);margin:0;">She.slays chuyên tổ chức các workshop sáng tạo dễ thương như làm vương niệm hoa khô, phụ kiện resin — phù hợp cho cá nhân và nhóm bạn muốn có một buổi chiều thư giãn và mang về sản phẩm tự tay làm.</p>
    </div>
    <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:20px;">
      <div class="section-title" style="font-size:15px;">Thông tin liên hệ</div>
      <div class="info-row" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);font-size:13.5px;"><span style="color:var(--muted);">Số điện thoại</span><span style="font-weight:600;">0934 802 345</span></div>
      <div class="info-row" style="display:flex;justify-content:space-between;padding:10px 0;font-size:13.5px;"><span style="color:var(--muted);">Email</span><span style="font-weight:600;">hello@sheslays.vn</span></div>
    </div>
    <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;">
      <div class="section-title" style="font-size:15px;">Địa chỉ</div>
      <p style="font-size:13.5px;color:var(--ink);margin:0;">Xưởng Cafe, Bạch Mai, Hà Nội</p>
    </div>
  </div>

  <!-- ===== EDIT MODE ===== -->
  <div id="edit-mode" style="display:none;background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;">
    <div class="field">
      <label>Logo</label>
      <div style="border:1.5px dashed var(--line);border-radius:12px;padding:16px;text-align:center;font-size:13px;color:var(--muted);cursor:pointer;"><svg class="icon icon-muted" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Bấm để đổi logo</div>
    </div>
    <div class="field"><label>Tên doanh nghiệp</label><input type="text" value="She.slays"></div>
    <div class="field"><label>Số điện thoại</label><input type="text" value="0934 802 345"></div>
    <div class="field"><label>Địa chỉ</label><input type="text" value="Xưởng Cafe, Bạch Mai, Hà Nội"></div>
    <div class="field"><label>Mô tả</label><textarea>She.slays chuyên tổ chức các workshop sáng tạo dễ thương như làm vương niệm hoa khô, phụ kiện resin...</textarea></div>
    <button class="btn btn-primary" onclick="saveProfile()">Lưu thay đổi</button>
  </div>
  <div id="save-toast" style="display:none;margin-top:16px;background:var(--success-bg);color:var(--success);padding:12px 16px;border-radius:12px;font-size:13.5px;font-weight:600;"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Cập nhật hồ sơ thành công.</div>

  <div class="section-title" style="font-size:15.5px;margin-top:32px;">Các hoạt động</div>
  <div class="table-responsive">
    <table class="biz-table">
    <thead><tr><th>Hoạt động</th><th>Giá</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
    <tbody>
      <tr><td style="font-weight:700;">Whimsical Crown</td><td>200.000 ₫</td><td><span class="b-badge active">Đang hiển thị</span></td><td><button class="row-btn" onclick="openDetail('whimsical')">Xem</button></td></tr>
      <tr><td style="font-weight:700;">Vintage Flower Crown</td><td>220.000 ₫</td><td><span class="b-badge pending">Chờ duyệt</span></td><td><button class="row-btn" onclick="openDetail('vintage')">Xem</button></td></tr>
      <tr><td style="font-weight:700;">Resin Charm Making</td><td>180.000 ₫</td><td><span class="b-badge active">Đang hiển thị</span></td><td><button class="row-btn" onclick="openDetail('resin')">Xem</button></td></tr>
    </tbody>
  </table>
  </div>

</div>

<!-- ===== SLIDE PANEL: CREATE/EDIT ACTIVITY ===== -->
<div class="panel-overlay" id="form-overlay" onclick="closeForm()"></div>
<div class="slide-panel" id="form-panel">
  <button class="panel-close" onclick="closeForm()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  <h2 id="form-title" style="font-size:20px;font-weight:800;margin:0 0 20px;">Tạo hoạt động mới</h2>

  <div class="field"><label>Tên hoạt động</label><input type="text" id="f-name" placeholder="VD: Whimsical Crown"></div>
  <div class="field"><label>Mô tả</label><textarea placeholder="Mô tả ngắn về hoạt động..."></textarea></div>
  <div class="field">
    <label>Ảnh / Video</label>
    <div style="border:1.5px dashed var(--line);border-radius:12px;padding:18px;text-align:center;font-size:13px;color:var(--muted);cursor:pointer;"><svg class="icon icon-muted" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Kéo thả hoặc bấm để tải ảnh/video lên</div>
  </div>
  <div class="field">
    <label>Danh mục</label>
    <div class="chip-row"><div class="chip active">Workshop</div><div class="chip">Giải trí</div><div class="chip">Ăn uống</div><div class="chip">Làm đẹp</div></div>
  </div>
  <div class="field">
    <label>Tag sở thích</label>
    <div class="chip-row"><div class="chip active">Sáng tạo</div><div class="chip">Chill</div><div class="chip">Nghệ thuật</div></div>
  </div>
  <div class="field"><label>Giá</label><input type="text" id="f-price" placeholder="VD: 200.000 ₫"></div>
  <div class="field"><label>Địa chỉ</label><input type="text" placeholder="Số nhà, đường, quận, thành phố"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
    <div class="field"><label>Thời gian bắt đầu</label><input type="text" placeholder="14:00"></div>
    <div class="field"><label>Thời gian kết thúc</label><input type="text" placeholder="20:00"></div>
  </div>
  <div class="field">
    <label>Vị trí trên bản đồ</label>
    <div class="map-box" style="height:140px;">
      <div class="map-grid-bg"></div>
      <div class="map-pin" style="left:50%;top:50%;"><svg class="icon icon-sm icon-white" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Chọn vị trí</div>
    </div>
  </div>

  <div style="display:flex;gap:10px;margin-top:8px;">
    <button class="btn btn-secondary" style="flex:1;" onclick="closeForm()">Lưu nháp</button>
    <button class="btn btn-primary" style="flex:1;" onclick="submitActivity()">Đăng hoạt động</button>
  </div>
</div>

<!-- ===== SLIDE PANEL: ACTIVITY DETAIL/STATS ===== -->
<div class="panel-overlay" id="detail-overlay" onclick="closeDetail()"></div>
<div class="slide-panel" id="detail-panel">
  <button class="panel-close" onclick="closeDetail()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  <div class="biz-stat-icon icon-rose" style="width:56px;height:56px;background:#FDEDEF;margin-bottom:10px;"><svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
  <h2 id="detail-title" style="font-size:20px;font-weight:800;margin:0 0 4px;">Whimsical Crown</h2>
  <div style="color:var(--muted);font-size:13px;margin-bottom:20px;">200.000 ₫ · 14:00–20:00 · Bạch Mai</div>

  <div class="biz-stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:24px;">
    <div class="biz-stat-card"><div class="biz-stat-num">312</div><div class="biz-stat-label">Lượt xem</div></div>
    <div class="biz-stat-card"><div class="biz-stat-num">47</div><div class="biz-stat-label">Lượt yêu thích</div></div>
    <div class="biz-stat-card"><div class="biz-stat-num">4.8 <svg class="icon icon-sm icon-fill icon-rose" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div class="biz-stat-label">Rating</div></div>
    <div class="biz-stat-card"><div class="biz-stat-num">32</div><div class="biz-stat-label">Số review</div></div>
  </div>

  <div style="display:flex;gap:10px;">
    <button class="btn btn-secondary" style="flex:1;" onclick="closeDetail();openForm('edit')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Chỉnh sửa</button>
    <button class="btn btn-secondary" style="flex:1;"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.62 21.62 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Ẩn hoạt động</button>
  </div>
</div>

<script>
function toggleEdit(){
  const editing = document.getElementById('edit-mode').style.display === 'block';
  document.getElementById('edit-mode').style.display = editing ? 'none':'block';
  document.getElementById('view-mode').style.display = editing ? 'block':'none';
}
function saveProfile(){
  toggleEdit();
  const t = document.getElementById('save-toast');
  t.style.display='block';
  setTimeout(()=>t.style.display='none', 2500);
}
function toggleMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('nav-user-menu');
  if(menu) menu.classList.toggle('show');
}
window.addEventListener('click', function() {
  const menu = document.getElementById('nav-user-menu');
  if(menu && menu.classList.contains('show')) menu.classList.remove('show');
});
function openForm(mode, id){
  document.getElementById('form-title').textContent = mode === 'create' ? 'Tạo hoạt động mới' : 'Chỉnh sửa hoạt động';
  document.getElementById('form-overlay').classList.add('show');
  document.getElementById('form-panel').classList.add('show');
}
function closeForm(){
  document.getElementById('form-overlay').classList.remove('show');
  document.getElementById('form-panel').classList.remove('show');
}
function submitActivity(){
  alert('Tạo hoạt động thành công.');
  closeForm();
}
function openDetail(id){
  document.getElementById('detail-overlay').classList.add('show');
  document.getElementById('detail-panel').classList.add('show');
}
function closeDetail(){
  document.getElementById('detail-overlay').classList.remove('show');
  document.getElementById('detail-panel').classList.remove('show');
}
function toggleStatus(btn, status){
  const row = btn.closest('tr');
  const badge = row.querySelector('.b-badge');
  const hiding = badge.textContent.trim() === 'Đang hiển thị';
  badge.textContent = hiding ? 'Đã ẩn' : 'Đang hiển thị';
  badge.className = 'b-badge ' + (hiding ? 'hidden' : 'active');
  btn.textContent = hiding ? 'Hiện' : 'Ẩn';
}
</script>
</body>
</html>
```

## File: `my-activities.html`
```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>FREE2DO Business — Hoạt động của tôi</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app-style.css">
</head>
<body>

<div class="navbar">
  <div class="nav-left" style="display:flex;align-items:center;gap:12px;">
    <button class="mobile-menu-btn" onclick="toggleMobileMenu()"><svg class="icon icon-lg" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
    <a href="business-home.html" class="nav-logo"><img src="Logo.svg" alt="Logo" style="width:38px;">FREE2DO <span style="color:var(--muted);font-weight:600;">Business</span></a>
  </div>
  <div class="nav-center">
    <a href="business-home.html" class="nav-link">Tổng quan</a>
    <a href="my-activities.html" class="nav-link active">Hoạt động của tôi</a>
    <a href="reviews.html" class="nav-link">Đánh giá</a>
  </div>
  <div class="nav-right">
    <div class="nav-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="dot-badge"></span></div>
    <div class="nav-who dropdown-wrap" onclick="toggleMenu(event)">
      <div class="nav-avatar">S</div><div class="nav-name">She.slays</div><svg class="icon icon-sm icon-muted" viewBox="0 0 24 24" style="margin-left:-4px;"><polyline points="6 9 12 15 18 9"/></svg>
      <div class="dropdown-menu" id="nav-user-menu">
        <a href="business-profile.html">Hồ sơ Doanh nghiệp</a>
        <a href="upgrade-plan.html">Gói dịch vụ</a>
        <a href="#">Đăng xuất</a>
      </div>
    </div>
  </div>
</div>

<div class="wrap" style="padding-top:32px;padding-bottom:60px;">

  <div class="welcome" style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;">
    <div>
      <h2 style="font-size:22px;font-weight:800;margin:0 0 6px;">Hoạt động của tôi</h2>
      <p style="color:var(--muted);font-size:14px;margin:0;">Quản lý toàn bộ hoạt động bạn đã đăng trên FREE2DO.</p>
    </div>
    <button class="btn btn-primary" onclick="openForm('create')"><svg class="icon icon-sm icon-white" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Tạo hoạt động</button>
  </div>

<div class="table-responsive">
    <table class="biz-table">
    <thead><tr><th>Activity</th><th>Thời gian</th><th>Địa điểm</th><th>Giá</th><th>Rating</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
    <tbody>
      <tr>
        <td style="font-weight:700;">Whimsical Crown</td><td>14:00–20:00</td><td>Bạch Mai</td><td>200.000 ₫</td><td><svg class="icon icon-sm icon-fill icon-rose" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 4.8</td>
        <td><span class="b-badge active">Đang hiển thị</span></td>
        <td><div class="row-actions">
          <button class="row-btn" onclick="openDetail('whimsical')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Xem</button>
          <button class="row-btn" onclick="openForm('edit','whimsical')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Chỉnh sửa</button>
          <button class="row-btn danger" onclick="toggleStatus(this,'hidden')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.62 21.62 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Ẩn</button>
        </div></td>
      </tr>
      <tr>
        <td style="font-weight:700;">Vintage Flower Crown</td><td>14:00–20:00</td><td>Bạch Mai</td><td>220.000 ₫</td><td><svg class="icon icon-sm icon-fill icon-rose" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 4.6</td>
        <td><span class="b-badge pending">Chờ duyệt</span></td>
        <td><div class="row-actions">
          <button class="row-btn" onclick="openDetail('vintage')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Xem</button>
          <button class="row-btn" onclick="openForm('edit','vintage')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Chỉnh sửa</button>
        </div></td>
      </tr>
      <tr>
        <td style="font-weight:700;">Resin Charm Making</td><td>10:00–18:00</td><td>Bạch Mai</td><td>180.000 ₫</td><td><svg class="icon icon-sm icon-fill icon-rose" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 4.9</td>
        <td><span class="b-badge active">Đang hiển thị</span></td>
        <td><div class="row-actions">
          <button class="row-btn" onclick="openDetail('resin')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Xem</button>
          <button class="row-btn" onclick="openForm('edit','resin')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Chỉnh sửa</button>
          <button class="row-btn danger" onclick="toggleStatus(this,'hidden')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.62 21.62 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Ẩn</button>
        </div></td>
      </tr>
      <tr id="row-old">
        <td style="font-weight:700;">Mini Pottery Class</td><td>09:00–11:00</td><td>Bạch Mai</td><td>150.000 ₫</td><td>—</td>
        <td><span class="b-badge hidden" id="old-badge">Hết hạn</span></td>
        <td><div class="row-actions">
          <button class="row-btn" onclick="openDetail('pottery')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Xem</button>
          <button class="row-btn" onclick="openForm('edit','pottery')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Chỉnh sửa</button>
        </div></td>
      </tr>
    </tbody>
  </table>
  </div>

</div>

<!-- ===== SLIDE PANEL: CREATE/EDIT ACTIVITY ===== -->
<div class="panel-overlay" id="form-overlay" onclick="closeForm()"></div>
<div class="slide-panel" id="form-panel">
  <button class="panel-close" onclick="closeForm()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  <h2 id="form-title" style="font-size:20px;font-weight:800;margin:0 0 20px;">Tạo hoạt động mới</h2>

  <div class="field"><label>Tên hoạt động</label><input type="text" id="f-name" placeholder="VD: Whimsical Crown"></div>
  <div class="field"><label>Mô tả</label><textarea placeholder="Mô tả ngắn về hoạt động..."></textarea></div>
  <div class="field">
    <label>Ảnh / Video</label>
    <div style="border:1.5px dashed var(--line);border-radius:12px;padding:18px;text-align:center;font-size:13px;color:var(--muted);cursor:pointer;"><svg class="icon icon-muted" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Kéo thả hoặc bấm để tải ảnh/video lên</div>
  </div>
  <div class="field">
    <label>Danh mục</label>
    <div class="chip-row"><div class="chip active">Workshop</div><div class="chip">Giải trí</div><div class="chip">Ăn uống</div><div class="chip">Làm đẹp</div></div>
  </div>
  <div class="field">
    <label>Tag sở thích</label>
    <div class="chip-row"><div class="chip active">Sáng tạo</div><div class="chip">Chill</div><div class="chip">Nghệ thuật</div></div>
  </div>
  <div class="field"><label>Giá</label><input type="text" id="f-price" placeholder="VD: 200.000 ₫"></div>
  <div class="field"><label>Địa chỉ</label><input type="text" placeholder="Số nhà, đường, quận, thành phố"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
    <div class="field"><label>Thời gian bắt đầu</label><input type="text" placeholder="14:00"></div>
    <div class="field"><label>Thời gian kết thúc</label><input type="text" placeholder="20:00"></div>
  </div>
  <div class="field">
    <label>Vị trí trên bản đồ</label>
    <div class="map-box" style="height:140px;">
      <div class="map-grid-bg"></div>
      <div class="map-pin" style="left:50%;top:50%;"><svg class="icon icon-sm icon-white" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Chọn vị trí</div>
    </div>
  </div>

  <div style="display:flex;gap:10px;margin-top:8px;">
    <button class="btn btn-secondary" style="flex:1;" onclick="closeForm()">Lưu nháp</button>
    <button class="btn btn-primary" style="flex:1;" onclick="submitActivity()">Đăng hoạt động</button>
  </div>
</div>

<!-- ===== SLIDE PANEL: ACTIVITY DETAIL/STATS ===== -->
<div class="panel-overlay" id="detail-overlay" onclick="closeDetail()"></div>
<div class="slide-panel" id="detail-panel">
  <button class="panel-close" onclick="closeDetail()"><svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  <div class="biz-stat-icon icon-rose" style="width:56px;height:56px;background:#FDEDEF;margin-bottom:10px;"><svg class="icon icon-lg" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
  <h2 id="detail-title" style="font-size:20px;font-weight:800;margin:0 0 4px;">Whimsical Crown</h2>
  <div style="color:var(--muted);font-size:13px;margin-bottom:20px;">200.000 ₫ · 14:00–20:00 · Bạch Mai</div>

  <div class="biz-stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:24px;">
    <div class="biz-stat-card"><div class="biz-stat-num">312</div><div class="biz-stat-label">Lượt xem</div></div>
    <div class="biz-stat-card"><div class="biz-stat-num">47</div><div class="biz-stat-label">Lượt yêu thích</div></div>
    <div class="biz-stat-card"><div class="biz-stat-num">4.8 <svg class="icon icon-sm icon-fill icon-rose" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div class="biz-stat-label">Rating</div></div>
    <div class="biz-stat-card"><div class="biz-stat-num">32</div><div class="biz-stat-label">Số review</div></div>
  </div>

  <div style="display:flex;gap:10px;">
    <button class="btn btn-secondary" style="flex:1;" onclick="closeDetail();openForm('edit')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Chỉnh sửa</button>
    <button class="btn btn-secondary" style="flex:1;"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.62 21.62 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Ẩn hoạt động</button>
  </div>
</div>

<script>
function toggleMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('nav-user-menu');
  if(menu) menu.classList.toggle('show');
}
window.addEventListener('click', function() {
  const menu = document.getElementById('nav-user-menu');
  if(menu && menu.classList.contains('show')) menu.classList.remove('show');
});
function openForm(mode, id){
  document.getElementById('form-title').textContent = mode === 'create' ? 'Tạo hoạt động mới' : 'Chỉnh sửa hoạt động';
  document.getElementById('form-overlay').classList.add('show');
  document.getElementById('form-panel').classList.add('show');
}
function closeForm(){
  document.getElementById('form-overlay').classList.remove('show');
  document.getElementById('form-panel').classList.remove('show');
}
function submitActivity(){
  alert('Tạo hoạt động thành công.');
  closeForm();
}
function openDetail(id){
  document.getElementById('detail-overlay').classList.add('show');
  document.getElementById('detail-panel').classList.add('show');
}
function closeDetail(){
  document.getElementById('detail-overlay').classList.remove('show');
  document.getElementById('detail-panel').classList.remove('show');
}
function toggleStatus(btn, status){
  const row = btn.closest('tr');
  const badge = row.querySelector('.b-badge');
  const hiding = badge.textContent.trim() === 'Đang hiển thị';
  badge.textContent = hiding ? 'Đã ẩn' : 'Đang hiển thị';
  badge.className = 'b-badge ' + (hiding ? 'hidden' : 'active');
  btn.textContent = hiding ? 'Hiện' : 'Ẩn';
}
</script>
</body>
</html>
```

## File: `reviews.html`
```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>FREE2DO Business — Đánh giá</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app-style.css">
<style>
  .rv-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px;}
  .rv-top{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
  .rv-name{font-weight:700;font-size:14px;}
  .rv-stars{color:var(--rose);font-size:13px;}
  .rv-date{margin-left:auto;font-size:12px;color:var(--muted);}
  .rv-text{font-size:13.5px;line-height:1.6;color:var(--ink);margin-bottom:14px;}
  .rv-actions{display:flex;gap:10px;}
  .reply-box{display:none;background:var(--paper);border-radius:12px;padding:16px;margin-top:14px;}
  .reply-box.show{display:block;}
  .biz-reply{background:#F3EFE4;border-left:3px solid var(--rose);border-radius:0 10px 10px 0;padding:12px 14px;margin-top:12px;font-size:13px;}
  .biz-reply b{color:var(--rose-dark);}
  .complaint-box{display:none;background:var(--danger-bg);border-radius:12px;padding:16px;margin-top:14px;}
  .complaint-box.show{display:block;}
  .reason-row{display:flex;flex-direction:column;gap:8px;font-size:13px;margin-bottom:12px;}
</style>
</head>
<body>

<div class="navbar">
  <div class="nav-left" style="display:flex;align-items:center;gap:12px;">
    <button class="mobile-menu-btn" onclick="toggleMobileMenu()"><svg class="icon icon-lg" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
    <a href="business-home.html" class="nav-logo"><img src="Logo.svg" alt="Logo" style="width:38px;">FREE2DO <span style="color:var(--muted);font-weight:600;">Business</span></a>
  </div>
  <div class="nav-center">
    <a href="business-home.html" class="nav-link">Tổng quan</a>
    <a href="my-activities.html" class="nav-link">Hoạt động của tôi</a>
    <a href="reviews.html" class="nav-link active">Đánh giá</a>
  </div>
  <div class="nav-right">
    <div class="nav-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="dot-badge"></span></div>
    <div class="nav-who dropdown-wrap" onclick="toggleMenu(event)">
      <div class="nav-avatar">S</div><div class="nav-name">She.slays</div><svg class="icon icon-sm icon-muted" viewBox="0 0 24 24" style="margin-left:-4px;"><polyline points="6 9 12 15 18 9"/></svg>
      <div class="dropdown-menu" id="nav-user-menu">
        <a href="business-profile.html">Hồ sơ Doanh nghiệp</a>
        <a href="upgrade-plan.html">Gói dịch vụ</a>
        <a href="#">Đăng xuất</a>
      </div>
    </div>
  </div>
</div>

<div class="wrap" style="padding-top:32px;padding-bottom:60px;max-width:800px;">

  <div class="section-title">Đánh giá của khách hàng</div>
  <div class="section-sub"><svg class="icon icon-sm icon-fill icon-rose" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> 4.8 trung bình · 32 đánh giá trên tất cả hoạt động</div>

  <!-- REVIEW 1: đã phản hồi -->
  <div class="rv-card">
    <div class="rv-top">
      <div class="nav-avatar" style="width:32px;height:32px;font-size:12px;">L</div>
      <div class="rv-name">Lê Thu</div>
      <div class="rv-stars star-row icon-rose"><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
      <div class="rv-date">05/09/2026</div>
    </div>
    <div class="rv-text">Không gian dễ thương, chị hướng dẫn nhiệt tình, làm xong mang về được ngay một chiếc vương niệm xinh xỉu 🌸</div>
    <div class="biz-reply"><b>She.slays phản hồi:</b> Cảm ơn Thu rất nhiều, hẹn gặp lại bạn ở workshop tiếp theo nha! 💛</div>
  </div>

  <!-- REVIEW 2: chưa phản hồi, có nút Phản hồi + Khiếu nại -->
  <div class="rv-card">
    <div class="rv-top">
      <div class="nav-avatar" style="width:32px;height:32px;font-size:12px;">Đ</div>
      <div class="rv-name">Đỗ Khánh Linh</div>
      <div class="rv-stars star-row icon-rose"><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm" viewBox="0 0 24 24" style="stroke-width:1.5;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
      <div class="rv-date">02/09/2026</div>
    </div>
    <div class="rv-text">Hoạt động vui, hơi đông vào cuối tuần nên phải đợi một chút, nhưng chất lượng ổn.</div>
    <div class="rv-actions">
      <button class="btn btn-secondary" style="height:36px;padding:0 14px;font-size:12.5px;" onclick="toggleBox('reply-2')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> Phản hồi</button>
      <button class="btn btn-ghost" style="height:36px;padding:0 10px;font-size:12.5px;" onclick="toggleBox('complaint-2')"><svg class="icon icon-sm icon-danger" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> Khiếu nại</button>
    </div>

    <div class="reply-box" id="reply-2">
      <div class="field" style="margin-bottom:10px;"><textarea placeholder="Nhập phản hồi của bạn..." id="reply-text-2"></textarea></div>
      <button class="btn btn-primary" style="height:38px;padding:0 16px;font-size:13px;" onclick="submitReply('reply-2')">Phản hồi</button>
    </div>

    <div class="complaint-box" id="complaint-2">
      <div class="section-title" style="font-size:13.5px;margin-bottom:10px;">Khiếu nại đánh giá</div>
      <div class="reason-row">
        <label><input type="radio" name="reason2"> Thông tin sai sự thật</label>
        <label><input type="radio" name="reason2"> Nội dung không phù hợp</label>
        <label><input type="radio" name="reason2"> Spam</label>
        <label><input type="radio" name="reason2"> Vi phạm quy định</label>
        <label><input type="radio" name="reason2"> Khác</label>
      </div>
      <div class="field" style="margin-bottom:10px;"><textarea placeholder="Mô tả chi tiết..."></textarea></div>
      <div style="border:1.5px dashed var(--line);border-radius:10px;padding:12px;text-align:center;font-size:12.5px;color:var(--muted);margin-bottom:12px;cursor:pointer;"><svg class="icon icon-sm icon-muted" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> Thêm file minh chứng</div>
      <button class="btn btn-primary" style="height:38px;padding:0 16px;font-size:13px;" onclick="submitComplaint('complaint-2')">Gửi khiếu nại</button>
    </div>
  </div>

  <!-- REVIEW 3 -->
  <div class="rv-card">
    <div class="rv-top">
      <div class="nav-avatar" style="width:32px;height:32px;font-size:12px;">H</div>
      <div class="rv-name">Hoàng Minh</div>
      <div class="rv-stars star-row icon-rose"><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><svg class="icon icon-sm icon-fill" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
      <div class="rv-date">28/08/2026</div>
    </div>
    <div class="rv-text">Trải nghiệm tuyệt vời, nguyên liệu chất lượng, sẽ quay lại thử hoạt động khác của shop.</div>
    <div class="rv-actions">
      <button class="btn btn-secondary" style="height:36px;padding:0 14px;font-size:12.5px;" onclick="toggleBox('reply-3')"><svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> Phản hồi</button>
      <button class="btn btn-ghost" style="height:36px;padding:0 10px;font-size:12.5px;" onclick="toggleBox('complaint-3')"><svg class="icon icon-sm icon-danger" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> Khiếu nại</button>
    </div>
    <div class="reply-box" id="reply-3">
      <div class="field" style="margin-bottom:10px;"><textarea placeholder="Nhập phản hồi của bạn..."></textarea></div>
      <button class="btn btn-primary" style="height:38px;padding:0 16px;font-size:13px;" onclick="submitReply('reply-3')">Phản hồi</button>
    </div>
    <div class="complaint-box" id="complaint-3">
      <div class="section-title" style="font-size:13.5px;margin-bottom:10px;">Khiếu nại đánh giá</div>
      <div class="reason-row">
        <label><input type="radio" name="reason3"> Thông tin sai sự thật</label>
        <label><input type="radio" name="reason3"> Nội dung không phù hợp</label>
        <label><input type="radio" name="reason3"> Spam</label>
        <label><input type="radio" name="reason3"> Vi phạm quy định</label>
        <label><input type="radio" name="reason3"> Khác</label>
      </div>
      <div class="field" style="margin-bottom:10px;"><textarea placeholder="Mô tả chi tiết..."></textarea></div>
      <button class="btn btn-primary" style="height:38px;padding:0 16px;font-size:13px;" onclick="submitComplaint('complaint-3')">Gửi khiếu nại</button>
    </div>
  </div>

  <div id="toast" style="display:none;background:var(--success-bg);color:var(--success);padding:12px 16px;border-radius:12px;font-size:13.5px;font-weight:600;text-align:center;"></div>

</div>

<script>
function toggleBox(id){
  const el = document.getElementById(id);
  const isReply = id.startsWith('reply');
  const otherId = isReply ? id.replace('reply','complaint') : id.replace('complaint','reply');
  document.getElementById(otherId).classList.remove('show');
  el.classList.toggle('show');
}
function submitReply(id){
  document.getElementById(id).classList.remove('show');
  showToast('Phản hồi đánh giá thành công.');
}
function submitComplaint(id){
  document.getElementById(id).classList.remove('show');
  showToast('Khiếu nại đã được gửi và đang được xem xét.');
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.innerHTML = '<svg class="icon icon-sm" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ' + msg;
  t.style.display = 'block';
  setTimeout(()=>t.style.display='none', 3000);
}
function toggleMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('nav-user-menu');
  if(menu) menu.classList.toggle('show');
}
window.addEventListener('click', function() {
  const menu = document.getElementById('nav-user-menu');
  if(menu && menu.classList.contains('show')) menu.classList.remove('show');
});
</script>
</body>
</html>
```

## File: `upgrade-plan.html`
```html
<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>FREE2DO Business — Nâng cấp gói</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app-style.css">
</head>
<body>

<div class="navbar">
  <div class="nav-left" style="display:flex;align-items:center;gap:12px;">
    <button class="mobile-menu-btn" onclick="toggleMobileMenu()"><svg class="icon icon-lg" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
    <a href="business-home.html" class="nav-logo"><img src="Logo.svg" alt="Logo" style="width:38px;">FREE2DO <span style="color:var(--muted);font-weight:600;">Business</span></a>
  </div>
  <div class="nav-center">
    <a href="business-home.html" class="nav-link">Tổng quan</a>
    <a href="my-activities.html" class="nav-link">Hoạt động của tôi</a>
    <a href="reviews.html" class="nav-link">Đánh giá</a>
  </div>
  <div class="nav-right">
    <div class="nav-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span class="dot-badge"></span></div>
    <div class="nav-who dropdown-wrap" onclick="toggleMenu(event)">
      <div class="nav-avatar">S</div><div class="nav-name">She.slays</div><svg class="icon icon-sm icon-muted" viewBox="0 0 24 24" style="margin-left:-4px;"><polyline points="6 9 12 15 18 9"/></svg>
      <div class="dropdown-menu" id="nav-user-menu">
        <a href="business-profile.html">Hồ sơ Doanh nghiệp</a>
        <a href="upgrade-plan.html">Gói dịch vụ</a>
        <a href="#">Đăng xuất</a>
      </div>
    </div>
  </div>
</div>

<div class="wrap" style="padding-top:40px;padding-bottom:60px;">

  <div style="text-align:center;margin-bottom:36px;">
    <div class="section-title" style="font-size:26px;">Nâng cấp gói</div>
    <div class="section-sub">Chọn gói phù hợp để tiếp cận nhiều khách hàng hơn trên FREE2DO</div>
  </div>

  <div class="plan-grid">

    <div class="plan-card">
      <span class="plan-badge-current">Gói hiện tại</span>
      <div class="plan-name">Free</div>
      <div class="plan-price">0 ₫<span>/tháng</span></div>
      <ul class="plan-features">
        <li>Tối đa 3 hoạt động</li>
        <li>Hiển thị cơ bản trong tìm kiếm</li>
        <li>Thống kê lượt xem cơ bản</li>
        <li>Hỗ trợ qua email</li>
      </ul>
      <button class="btn btn-secondary btn-block" disabled style="opacity:0.6;cursor:default;">Đang sử dụng</button>
    </div>

    <div class="plan-card highlight">
      <div class="plan-name" style="color:var(--rose-dark);">Standard</div>
      <div class="plan-price">299.000 ₫<span>/tháng</span></div>
      <ul class="plan-features">
        <li>Tối đa 15 hoạt động</li>
        <li>Ưu tiên hiển thị trong kết quả tìm kiếm</li>
        <li>Thống kê chi tiết (lượt xem, yêu thích, chuyển đổi)</li>
        <li>Huy hiệu "Đối tác xác minh"</li>
        <li>Hỗ trợ ưu tiên 24/7</li>
      </ul>
      <button class="btn btn-primary btn-block">Nâng cấp gói</button>
    </div>

    <div class="plan-card highlight">
      <div class="plan-name" style="color:var(--rose-dark);">Premium</div>
      <div class="plan-price">699.000 ₫<span>/tháng</span></div>
      <ul class="plan-features">
        <li>Không giới hạn hoạt động</li>
        <li>Vị trí nổi bật trên trang chủ FREE2DO</li>
        <li>Thống kê nâng cao + báo cáo hàng tháng</li>
        <li>Huy hiệu "Đối tác xác minh"</li>
        <li>Quản lý đa chi nhánh</li>
        <li>Hỗ trợ riêng 1-1</li>
      </ul>
      <button class="btn btn-primary btn-block">Nâng cấp gói</button>
    </div>

  </div>

</div>

<div class="mobile-nav-panel" id="mobile-nav">
  <div class="mobile-nav-content">
    <button class="mobile-nav-close" onclick="toggleMobileMenu()">&times;</button>
    <a href="business-home.html" class="mobile-nav-link">Tổng quan</a>
    <a href="my-activities.html" class="mobile-nav-link">Hoạt động của tôi</a>
    <a href="reviews.html" class="mobile-nav-link">Đánh giá</a>
  </div>
</div>
<script>
function toggleMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('nav-user-menu');
  if(menu) menu.classList.toggle('show');
}
function toggleMobileMenu() {
  const panel = document.getElementById('mobile-nav');
  if(panel) panel.classList.toggle('show');
}
window.addEventListener('click', function(e) {
  const menu = document.getElementById('nav-user-menu');
  if(menu && menu.classList.contains('show') && !e.target.closest('.nav-who')) {
    menu.classList.remove('show');
  }
});
</script>
</body>
</html>
```

